#include "telemetry_buffer.h"

TelemetryBuffer telemetryBuffer;

TelemetryBuffer::TelemetryBuffer()
    : head(0), tail(0), current_count(0)
{
}

bool TelemetryBuffer::push(const CompactPacket& packet) {
    if (isFull()) {
        // Drop oldest to preserve the newest sliding window
        tail = (tail + 1) % MAX_BUFFERED_PACKETS;
        current_count--;
    }
    
    buffer[head] = packet;
    buffer[head].buffered = true;
    head = (head + 1) % MAX_BUFFERED_PACKETS;
    current_count++;
    return true;
}

bool TelemetryBuffer::pop(CompactPacket* out_packet) {
    if (isEmpty()) return false;
    
    *out_packet = buffer[tail];
    tail = (tail + 1) % MAX_BUFFERED_PACKETS;
    current_count--;
    return true;
}

size_t TelemetryBuffer::count() const {
    return current_count;
}

bool TelemetryBuffer::isFull() const {
    return current_count >= MAX_BUFFERED_PACKETS;
}

bool TelemetryBuffer::isEmpty() const {
    return current_count == 0;
}

void TelemetryBuffer::clear() {
    head = 0;
    tail = 0;
    current_count = 0;
}
