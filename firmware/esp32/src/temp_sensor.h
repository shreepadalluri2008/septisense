#ifndef SEPTISENSE_TEMP_SENSOR_H
#define SEPTISENSE_TEMP_SENSOR_H

#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "config.h"

class TempSensor {
public:
    TempSensor();
    bool begin();
    
    // Requests asynchronous temperature conversion
    void requestConversion();
    
    // Reads validated temperature in Celsius
    float readTemperature();

private:
    OneWire oneWire;
    DallasTemperature sensors;
    bool is_available;
    float last_temp_c;
};

extern TempSensor tempSensor;

#endif // SEPTISENSE_TEMP_SENSOR_H
