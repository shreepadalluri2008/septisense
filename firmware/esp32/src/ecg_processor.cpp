#include "ecg_processor.h"

ECGProcessor ecgProcessor;

ECGProcessor::ECGProcessor() 
    : write_idx(0), read_idx(0), ma_idx(0), ma_sum(0),
      last_r_peak_time_ms(0), current_hr_bpm(0.0f),
      leads_off_start_ms(0), was_leads_off(false),
      energy_threshold(15000), prev_filtered(0), prev_prev_filtered(0)
{
    memset((void*)ring_buffer, 0, sizeof(ring_buffer));
    memset((void*)ma_buffer, 0, sizeof(ma_buffer));
}

void ECGProcessor::begin() {
    pinMode(PIN_ECG_ANALOG, INPUT);
    pinMode(PIN_ECG_LO_PLUS, INPUT);
    pinMode(PIN_ECG_LO_MINUS, INPUT);
    
    // Configure ESP32 ADC1: 12-bit resolution (0-4095), 11dB attenuation (~0 - 3.1V range)
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
}

void ECGProcessor::addSample(uint16_t raw_adc) {
    ring_buffer[write_idx] = raw_adc;
    write_idx = (write_idx + 1) % RING_SIZE;
}

bool ECGProcessor::getChunk(int16_t* out_buffer, size_t max_samples) {
    if (max_samples < ECG_CHUNK_SAMPLES) return false;
    
    // Copy the latest 250 samples in chronological order
    size_t cur_write = write_idx;
    size_t start_idx = (cur_write + RING_SIZE - ECG_CHUNK_SAMPLES) % RING_SIZE;
    
    for (size_t i = 0; i < ECG_CHUNK_SAMPLES; i++) {
        size_t idx = (start_idx + i) % RING_SIZE;
        out_buffer[i] = (int16_t)ring_buffer[idx];
    }
    return true;
}

ECGMetrics ECGProcessor::processMetrics() {
    ECGMetrics metrics;
    
    // 1. Check Hardware Leads-Off pins (Active HIGH on AD8232)
    bool lo_p = digitalRead(PIN_ECG_LO_PLUS) == HIGH;
    bool lo_m = digitalRead(PIN_ECG_LO_MINUS) == HIGH;
    metrics.leads_off = (lo_p || lo_m);
    
    uint32_t now_ms = millis();
    if (metrics.leads_off) {
        if (!was_leads_off) {
            leads_off_start_ms = now_ms;
            was_leads_off = true;
        }
        metrics.leads_off_duration_ms = now_ms - leads_off_start_ms;
    } else {
        was_leads_off = false;
        metrics.leads_off_duration_ms = 0;
    }
    
    // 2. Scan latest chunk for ADC saturation clipping (0 or 4095)
    size_t cur_write = write_idx;
    size_t start_idx = (cur_write + RING_SIZE - ECG_CHUNK_SAMPLES) % RING_SIZE;
    size_t sat_count = 0;
    
    for (size_t i = 0; i < ECG_CHUNK_SAMPLES; i++) {
        uint16_t val = ring_buffer[(start_idx + i) % RING_SIZE];
        if (val <= 5 || val >= 4090) {
            sat_count++;
        }
        
        // Pan-Tompkins QRS Derivative & Energy integration
        // Baseline removal: high-pass moving-average filter
        ma_sum -= ma_buffer[ma_idx];
        ma_buffer[ma_idx] = val;
        ma_sum += val;
        ma_idx = (ma_idx + 1) % MA_WIN;
        int16_t baseline = ma_sum / MA_WIN;
        int16_t hp_val = val - baseline;
        
        // Difference derivative
        int16_t diff = hp_val - prev_prev_filtered;
        prev_prev_filtered = prev_filtered;
        prev_filtered = hp_val;
        
        int32_t energy = (int32_t)diff * (int32_t)diff;
        
        // QRS Detection: Refractory period 250ms (max 240 bpm)
        if (energy > energy_threshold && (now_ms - last_r_peak_time_ms > 250)) {
            if (last_r_peak_time_ms > 0) {
                uint32_t rr_interval_ms = now_ms - last_r_peak_time_ms;
                // Reject impossible RR intervals (<270ms or >2000ms)
                if (rr_interval_ms >= 270 && rr_interval_ms <= 2000) {
                    float inst_hr = 60000.0f / (float)rr_interval_ms;
                    // Exponential smoothing for stable HR
                    if (current_hr_bpm <= 0.0f) {
                        current_hr_bpm = inst_hr;
                    } else {
                        current_hr_bpm = (0.7f * current_hr_bpm) + (0.3f * inst_hr);
                    }
                }
            }
            last_r_peak_time_ms = now_ms;
            // Adaptive threshold update
            energy_threshold = (energy_threshold * 7 + energy) / 8;
        } else {
            // Decay threshold slowly towards baseline
            energy_threshold = (energy_threshold * 99) / 100;
            if (energy_threshold < 5000) energy_threshold = 5000;
        }
    }
    
    metrics.adc_saturated = (sat_count > (ECG_CHUNK_SAMPLES * 0.05)); // >5% clipped
    
    // Timeout HR if no beats detected in 3 seconds
    if (now_ms - last_r_peak_time_ms > 3000 || metrics.leads_off) {
        current_hr_bpm = 0.0f;
    }
    
    metrics.heart_rate_bpm = current_hr_bpm;
    return metrics;
}
