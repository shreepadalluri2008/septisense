#ifndef SEPTISENSE_ECG_PROCESSOR_H
#define SEPTISENSE_ECG_PROCESSOR_H

#include <Arduino.h>
#include "config.h"

struct ECGMetrics {
    float heart_rate_bpm;
    bool leads_off;
    bool adc_saturated;
    uint32_t leads_off_duration_ms;
};

class ECGProcessor {
public:
    ECGProcessor();
    void begin();
    
    // Called at 250 Hz (via hardware timer interrupt or high-priority task)
    void addSample(uint16_t raw_adc);
    
    // Extracts the latest 1-second chunk (250 samples)
    bool getChunk(int16_t* out_buffer, size_t max_samples);
    
    // Computes QRS detection, RR intervals, and leads-off status
    ECGMetrics processMetrics();

private:
    static const size_t RING_SIZE = 500;
    volatile uint16_t ring_buffer[RING_SIZE];
    volatile size_t write_idx;
    size_t read_idx;
    
    // Moving-average baseline removal filter
    static const size_t MA_WIN = 25; // 100 ms at 250 Hz
    int32_t ma_buffer[MA_WIN];
    size_t ma_idx;
    int32_t ma_sum;
    
    // Pan-Tompkins QRS peak detection states
    uint32_t last_r_peak_time_ms;
    float current_hr_bpm;
    uint32_t leads_off_start_ms;
    bool was_leads_off;
    
    // Adaptive energy threshold
    int32_t energy_threshold;
    int16_t prev_filtered;
    int16_t prev_prev_filtered;
};

extern ECGProcessor ecgProcessor;

#endif // SEPTISENSE_ECG_PROCESSOR_H
