/**
 * SeptiSense ESP32 Firmware Configuration
 */

#ifndef SEPTISENSE_CONFIG_H
#define SEPTISENSE_CONFIG_H

// --- Device Identification ---
#define DEVICE_ID           "esp32-01"
#define PATIENT_ID          1
#define FIRMWARE_VERSION    "1.0.0"

// --- Hardware Pin Definitions ---
// AD8232 ECG Sensor (ADC1 only to permit Wi-Fi coexistence)
#define PIN_ECG_ANALOG      34    // ADC1_CH6 (Analog out)
#define PIN_ECG_LO_PLUS     18    // Leads-off detector LO+
#define PIN_ECG_LO_MINUS    19    // Leads-off detector LO-

// MAX30102 Heart Rate & SpO2 Sensor (I2C)
#define PIN_I2C_SDA         21
#define PIN_I2C_SCL         22

// Temperature Sensor: DS18B20 (OneWire)
#define PIN_ONEWIRE_TEMP    4     // DS18B20 digital 1-Wire pin (with 4.7k pull-up resistor to 3.3V)

// Local Feedback Peripherals
#define PIN_ALERT_LED       2     // Onboard blue LED
#define PIN_ALERT_BUZZER    15    // Active piezo buzzer pin

// --- Sampling & Telemetry Settings ---
#define ECG_SAMPLE_RATE_HZ  250   // 250 Hz standard cardiac sampling
#define ECG_CHUNK_SAMPLES   250   // 1 second chunk (250 samples)
#define TELEMETRY_INTERVAL_MS 1000 // Broadcast 1 packet per second
#define SERIAL_BAUD_RATE    921600

// RAM Telemetry Ring Buffer (stores up to 180 seconds during USB disconnect)
#define MAX_BUFFERED_PACKETS 180

// --- NTP Time Synchronization ---
#define NTP_SERVER_1        "pool.ntp.org"
#define NTP_SERVER_2        "time.nist.gov"
#define GMT_OFFSET_SEC      0     // UTC timestamp
#define DAYLIGHT_OFFSET_SEC 0

#endif // SEPTISENSE_CONFIG_H
