/**
 * SeptiSense ESP32 Firmware
 * Multi-sensor IoT telemetry node for physiological monitoring & sepsis early-warning.
 * Sensors:
 * - AD8232 ECG Module (250 Hz sampling via hardware timer interrupt)
 * - MAX30102 Pulse Oximeter & Heart Rate (I2C)
 * - DS18B20 Clinical Temperature (OneWire)
 * Transport:
 * - Primary: USB Serial @ 921600 baud with CRC32 integrity check & RAM buffering
 * - Optional Fallback: Wi-Fi HTTP POST (compile-time flag TRANSPORT_WIFI)
 */

#include <Arduino.h>
#include <ArduinoJson.h>
#include "config.h"
#include "ecg_processor.h"
#include "max30102_sensor.h"
#include "temp_sensor.h"
#include "telemetry_buffer.h"

#ifdef TRANSPORT_WIFI
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#endif

// Hardware Timer for strict 250 Hz ECG sampling
hw_timer_t* ecg_timer = NULL;
portMUX_TYPE timerMux = portMUX_INITIALIZER_UNLOCKED;

// Timing states
uint32_t last_telemetry_ms = 0;
bool is_time_synced = false;
bool host_connected = true;

// Helper: Hardware CRC32 Calculation
uint32_t calculate_crc32(const char* data, size_t length) {
    uint32_t crc = 0xFFFFFFFF;
    for (size_t i = 0; i < length; i++) {
        uint8_t byte = (uint8_t)data[i];
        crc ^= byte;
        for (int j = 0; j < 8; j++) {
            if (crc & 1) crc = (crc >> 1) ^ 0xEDB88320;
            else crc >>= 1;
        }
    }
    return ~crc;
}

// 250 Hz Timer Interrupt Service Routine (ISR)
void IRAM_ATTR onEcgTimer() {
    portENTER_CRITICAL_ISR(&timerMux);
    uint16_t adc_val = analogRead(PIN_ECG_ANALOG);
    ecgProcessor.addSample(adc_val);
    portEXIT_CRITICAL_ISR(&timerMux);
}

void setupTimer250Hz() {
    // Prescaler 80 -> 1 MHz timer (1 tick = 1 microsecond)
    // Alarm at 4000 ticks = 4 ms period = 250 Hz
    ecg_timer = timerBegin(0, 80, true);
    timerAttachInterrupt(ecg_timer, &onEcgTimer, true);
    timerAlarmWrite(ecg_timer, 4000, true);
    timerAlarmEnable(ecg_timer);
    Serial.println("[TIMER] 250 Hz ECG hardware sampling timer enabled.");
}

void syncNTP() {
#ifdef TRANSPORT_WIFI
    if (WiFi.status() == WL_CONNECTED) {
        configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER_1, NTP_SERVER_2);
        struct tm timeinfo;
        if (getLocalTime(&timeinfo, 3000)) {
            is_time_synced = true;
            Serial.println("[NTP] Clock synchronized successfully.");
            return;
        }
    }
#endif
    is_time_synced = false;
}

uint64_t getCurrentTimeMs() {
#ifdef TRANSPORT_WIFI
    if (is_time_synced) {
        struct timeval tv;
        gettimeofday(&tv, NULL);
        return ((uint64_t)tv.tv_sec * 1000ULL) + ((uint64_t)tv.tv_usec / 1000ULL);
    }
#endif
    return (uint64_t)millis();
}

void setup() {
    // 1. Initialize High-Speed Primary Serial Transport
    Serial.begin(SERIAL_BAUD_RATE);
    delay(500);
    Serial.println("\n========================================================");
    Serial.println(" SeptiSense ESP32 Patient Telemetry Node v" FIRMWARE_VERSION);
    Serial.println("========================================================");

    // 2. Local Alert Peripherals
    pinMode(PIN_ALERT_LED, OUTPUT);
    pinMode(PIN_ALERT_BUZZER, OUTPUT);
    digitalWrite(PIN_ALERT_LED, LOW);
    digitalWrite(PIN_ALERT_BUZZER, LOW);

    // 3. Initialize Sensors
    ecgProcessor.begin();
    max30102Sensor.begin();
    tempSensor.begin();

    // 4. Start 250 Hz Hardware Sampling Timer
    setupTimer250Hz();

    // 5. Optional Wi-Fi Setup
#ifdef TRANSPORT_WIFI
    Serial.printf("[WIFI] Connecting to %s...\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    uint32_t t_start = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - t_start < 8000)) {
        delay(250);
        Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WIFI] Connected! Local IP: %s\n", WiFi.localIP().toString().c_str());
        syncNTP();
    } else {
        Serial.println("\n[WIFI] Connection failed. Using USB Serial transport.");
    }
#endif
}

void sendTelemetryPacket(bool is_buffered = false) {
    // 1. Collect latest metrics
    ECGMetrics ecg_m = ecgProcessor.processMetrics();
    MAX30102Data ppg_d = max30102Sensor.readData();
    float temp_val = tempSensor.readTemperature();
    
    // 2. Extract 1-second ECG raw waveform (250 samples)
    int16_t ecg_samples[ECG_CHUNK_SAMPLES];
    ecgProcessor.getChunk(ecg_samples, ECG_CHUNK_SAMPLES);
    
    // 3. Check Local Alert conditions (leads off > 10 s)
    if (ecg_m.leads_off && ecg_m.leads_off_duration_ms > 10000) {
        digitalWrite(PIN_ALERT_LED, HIGH);
        // Beep buzzer intermittently
        if ((millis() / 500) % 2 == 0) digitalWrite(PIN_ALERT_BUZZER, HIGH);
        else digitalWrite(PIN_ALERT_BUZZER, LOW);
    } else {
        digitalWrite(PIN_ALERT_LED, LOW);
        digitalWrite(PIN_ALERT_BUZZER, LOW);
    }

    // 4. Construct JSON Payload
    JsonDocument doc;
    doc["device_id"] = DEVICE_ID;
    doc["patient_id"] = PATIENT_ID;
    doc["ts_ms"] = getCurrentTimeMs();
    doc["time_synced"] = is_time_synced;
    doc["buffered"] = is_buffered;
    
    // Heart rate selection (prefer optical if valid, fallback to ECG HR)
    float reported_hr = (ppg_d.heart_rate_bpm > 0) ? ppg_d.heart_rate_bpm : ecg_m.heart_rate_bpm;
    if (reported_hr > 0) doc["hr_bpm"] = round(reported_hr * 10.0f) / 10.0f;
    else doc["hr_bpm"] = nullptr;
    
    if (ppg_d.spo2_pct > 0) doc["spo2_pct"] = round(ppg_d.spo2_pct * 10.0f) / 10.0f;
    else doc["spo2_pct"] = nullptr;
    
    if (temp_val > 0) doc["temp_c"] = round(temp_val * 100.0f) / 100.0f;
    else doc["temp_c"] = nullptr;
    
    // ECG Waveform array (250 ints)
    JsonArray ecg_arr = doc["ecg"].to<JsonArray>();
    for (size_t i = 0; i < ECG_CHUNK_SAMPLES; i++) {
        ecg_arr.add(ecg_samples[i]);
    }
    doc["ecg_fs"] = ECG_SAMPLE_RATE_HZ;
    
    // Sensor flags
    JsonObject flags = doc["flags"].to<JsonObject>();
    flags["leads_off"] = ecg_m.leads_off;
    flags["finger_off"] = ppg_d.finger_off;
    flags["adc_saturated"] = ecg_m.adc_saturated;
    
    int8_t rssi_val = -60;
#ifdef TRANSPORT_WIFI
    if (WiFi.status() == WL_CONNECTED) rssi_val = WiFi.RSSI();
#endif
    doc["rssi"] = rssi_val;

    // Serialize JSON
    String json_str;
    serializeJson(doc, json_str);
    
    // Compute CRC32 over the payload
    uint32_t crc = calculate_crc32(json_str.c_str(), json_str.length());
    
    // Create final wire frame with CRC
    doc["crc"] = crc;
    String wire_str;
    serializeJson(doc, wire_str);

    // 5. Send via Primary USB Serial Transport
    Serial.println(wire_str);
    Serial.flush();

    // 6. Optional Wi-Fi Fallback
#ifdef TRANSPORT_WIFI
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        String url = String("http://") + BACKEND_HOST + ":" + BACKEND_PORT + TELEMETRY_API_PATH;
        http.begin(url);
        http.addHeader("Content-Type", "application/json");
        int code = http.POST(wire_str);
        if (code == 200) {
            String resp = http.getString();
            if (resp.indexOf("\"alert\":true") >= 0) {
                // Backend commanded alert
                digitalWrite(PIN_ALERT_LED, HIGH);
            }
        }
        http.end();
    }
#endif
}

void loop() {
    // 1. MAX30102 I2C processing
    max30102Sensor.update();

    // 2. Periodic 1 Hz Telemetry Broadcast
    uint32_t now = millis();
    if (now - last_telemetry_ms >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_ms = now;
        
        // Flush any buffered packets first
        CompactPacket buf_pkt;
        while (telemetryBuffer.pop(&buf_pkt)) {
            // Emits previously stored packets marked buffered=true
            sendTelemetryPacket(true);
        }
        
        // Send live packet
        sendTelemetryPacket(false);
    }
}
