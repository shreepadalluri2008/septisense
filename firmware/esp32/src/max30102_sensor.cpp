#include "max30102_sensor.h"

MAX30102Sensor max30102Sensor;

#define MAX30102_I2C_ADDR 0x57

MAX30102Sensor::MAX30102Sensor()
    : is_initialized(false), red_val(0), ir_val(0),
      red_dc(0.0f), ir_dc(0.0f), red_ac_sq(0.0f), ir_ac_sq(0.0f),
      last_ir_beat_ms(0), opt_hr_bpm(0.0f)
{
}

bool MAX30102Sensor::begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(400000); // 400 kHz Fast I2C
    
    // Test I2C communication
    Wire.beginTransmission(MAX30102_I2C_ADDR);
    if (Wire.endTransmission() != 0) {
        Serial.println("[MAX30102] Sensor not found on I2C bus.");
        is_initialized = false;
        return false;
    }
    
    // Reset MAX30102
    Wire.beginTransmission(MAX30102_I2C_ADDR);
    Wire.write(0x09); // Mode Config
    Wire.write(0x40); // Reset bit
    Wire.endTransmission();
    delay(50);
    
    // SpO2 Mode (Red + IR active)
    Wire.beginTransmission(MAX30102_I2C_ADDR);
    Wire.write(0x09);
    Wire.write(0x03);
    Wire.endTransmission();
    
    // SpO2 Config: ADC range 4096nA, 100 Hz sample rate, 411us pulse width
    Wire.beginTransmission(MAX30102_I2C_ADDR);
    Wire.write(0x0A);
    Wire.write(0x27);
    Wire.endTransmission();
    
    // LED Pulse Amplitude: ~7.2mA for Red and IR
    Wire.beginTransmission(MAX30102_I2C_ADDR);
    Wire.write(0x0C); // Red LED
    Wire.write(0x24);
    Wire.endTransmission();
    
    Wire.beginTransmission(MAX30102_I2C_ADDR);
    Wire.write(0x0D); // IR LED
    Wire.write(0x24);
    Wire.endTransmission();
    
    is_initialized = true;
    Serial.println("[MAX30102] Initialized successfully.");
    return true;
}

void MAX30102Sensor::update() {
    if (!is_initialized) return;
    
    // Read FIFO data (6 bytes: 3 bytes Red, 3 bytes IR)
    Wire.beginTransmission(MAX30102_I2C_ADDR);
    Wire.write(0x07); // FIFO data register
    Wire.endTransmission(false);
    
    Wire.requestFrom(MAX30102_I2C_ADDR, 6);
    if (Wire.available() >= 6) {
        uint32_t b1 = Wire.read();
        uint32_t b2 = Wire.read();
        uint32_t b3 = Wire.read();
        red_val = ((b1 << 16) | (b2 << 8) | b3) & 0x03FFFF;
        
        uint32_t b4 = Wire.read();
        uint32_t b5 = Wire.read();
        uint32_t b6 = Wire.read();
        ir_val = ((b4 << 16) | (b5 << 8) | b6) & 0x03FFFF;
        
        // Track DC and AC components
        if (ir_val > 50000) { // Finger detected threshold
            red_dc = (0.95f * red_dc) + (0.05f * (float)red_val);
            ir_dc = (0.95f * ir_dc) + (0.05f * (float)ir_val);
            
            float red_ac = (float)red_val - red_dc;
            float ir_ac = (float)ir_val - ir_dc;
            
            red_ac_sq = (0.95f * red_ac_sq) + (0.05f * (red_ac * red_ac));
            ir_ac_sq = (0.95f * ir_ac_sq) + (0.05f * (ir_ac * ir_ac));
            
            // Optical beat timing
            uint32_t now_ms = millis();
            if (ir_ac > 250.0f && (now_ms - last_ir_beat_ms > 300)) {
                if (last_ir_beat_ms > 0) {
                    uint32_t dt = now_ms - last_ir_beat_ms;
                    if (dt >= 270 && dt <= 2000) {
                        float inst_hr = 60000.0f / (float)dt;
                        opt_hr_bpm = (opt_hr_bpm <= 0.0f) ? inst_hr : ((0.8f * opt_hr_bpm) + (0.2f * inst_hr));
                    }
                }
                last_ir_beat_ms = now_ms;
            }
        } else {
            opt_hr_bpm = 0.0f;
        }
    }
}

MAX30102Data MAX30102Sensor::readData() {
    MAX30102Data d;
    d.red_raw = red_val;
    d.ir_raw = ir_val;
    
    // Finger detection threshold
    d.finger_off = (ir_val < 50000);
    
    if (d.finger_off) {
        d.heart_rate_bpm = 0.0f;
        d.spo2_pct = 0.0f;
        return d;
    }
    
    // Ratio of Ratios: R = (AC_red / DC_red) / (AC_ir / DC_ir)
    float red_rms = sqrtf(red_ac_sq);
    float ir_rms = sqrtf(ir_ac_sq);
    
    if (ir_rms > 0.0f && ir_dc > 0.0f && red_dc > 0.0f) {
        float R = (red_rms / red_dc) / (ir_rms / ir_dc);
        // Standard empirical formula: SpO2 = 110 - 25 * R
        float calc_spo2 = 110.0f - (25.0f * R);
        
        // Physiological bounds validation (70% - 100%)
        if (calc_spo2 >= 70.0f && calc_spo2 <= 100.0f) {
            d.spo2_pct = calc_spo2;
        } else if (calc_spo2 > 100.0f) {
            d.spo2_pct = 99.0f;
        } else {
            d.spo2_pct = 0.0f; // Invalid / impossible
        }
    } else {
        d.spo2_pct = 0.0f;
    }
    
    // Validate Optical HR
    if (opt_hr_bpm >= 30.0f && opt_hr_bpm <= 220.0f) {
        d.heart_rate_bpm = opt_hr_bpm;
    } else {
        d.heart_rate_bpm = 0.0f;
    }
    
    return d;
}
