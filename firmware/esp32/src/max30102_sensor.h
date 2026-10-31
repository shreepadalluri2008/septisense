#ifndef SEPTISENSE_MAX30102_SENSOR_H
#define SEPTISENSE_MAX30102_SENSOR_H

#include <Arduino.h>
#include <Wire.h>
#include "config.h"

struct MAX30102Data {
    float heart_rate_bpm;
    float spo2_pct;
    bool finger_off;
    uint32_t red_raw;
    uint32_t ir_raw;
};

class MAX30102Sensor {
public:
    MAX30102Sensor();
    bool begin();
    
    // Updates reading buffer from I2C FIFO
    void update();
    
    // Returns latest validated physiological metrics
    MAX30102Data readData();

private:
    bool is_initialized;
    uint32_t red_val;
    uint32_t ir_val;
    
    // Ratio-of-ratios tracking
    float red_dc;
    float ir_dc;
    float red_ac_sq;
    float ir_ac_sq;
    
    // Peak timing for Optical HR
    uint32_t last_ir_beat_ms;
    float opt_hr_bpm;
};

extern MAX30102Sensor max30102Sensor;

#endif // SEPTISENSE_MAX30102_SENSOR_H
