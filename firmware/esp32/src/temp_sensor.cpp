#include "temp_sensor.h"

TempSensor tempSensor;

TempSensor::TempSensor()
    : oneWire(PIN_ONEWIRE_TEMP), sensors(&oneWire),
      is_available(false), last_temp_c(36.8f)
{
}

bool TempSensor::begin() {
    sensors.begin();
    sensors.setWaitForConversion(false); // Non-blocking asynchronous conversion
    
    int dev_count = sensors.getDeviceCount();
    if (dev_count > 0) {
        is_available = true;
        sensors.setResolution(11); // 11-bit resolution = 0.125°C precision, 375ms conversion time
        requestConversion();
        Serial.printf("[TEMP] Found %d DS18B20 OneWire temperature sensor(s).\n", dev_count);
        return true;
    } else {
        is_available = false;
        Serial.println("[TEMP] No OneWire DS18B20 temperature sensor detected on GPIO 4.");
        return false;
    }
}

void TempSensor::requestConversion() {
    if (is_available) {
        sensors.requestTemperatures();
    }
}

float TempSensor::readTemperature() {
    if (!is_available) {
        return -999.0f; // Sensor offline
    }
    
    float raw_c = sensors.getTempCByIndex(0);
    requestConversion(); // Trigger next conversion for the next second
    
    // Check for OneWire disconnected error code (-127°C or 85°C power-on default)
    if (raw_c <= -100.0f || raw_c == 85.0f) {
        return -999.0f;
    }
    
    // Physiological bounds validation: 30.0°C to 43.0°C
    if (raw_c >= 30.0f && raw_c <= 43.0f) {
        last_temp_c = raw_c;
        return raw_c;
    }
    
    return -999.0f; // Out-of-bounds rejected
}
