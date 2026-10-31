#ifndef SEPTISENSE_TELEMETRY_BUFFER_H
#define SEPTISENSE_TELEMETRY_BUFFER_H

#include <Arduino.h>
#include "config.h"

struct CompactPacket {
    uint32_t ts_ms;
    float hr_bpm;
    float spo2_pct;
    float temp_c;
    bool leads_off;
    bool finger_off;
    bool adc_saturated;
    bool buffered;
};

class TelemetryBuffer {
public:
    TelemetryBuffer();
    
    bool push(const CompactPacket& packet);
    bool pop(CompactPacket* out_packet);
    size_t count() const;
    bool isFull() const;
    bool isEmpty() const;
    void clear();

private:
    CompactPacket buffer[MAX_BUFFERED_PACKETS];
    size_t head;
    size_t tail;
    size_t current_count;
};

extern TelemetryBuffer telemetryBuffer;

#endif // SEPTISENSE_TELEMETRY_BUFFER_H
