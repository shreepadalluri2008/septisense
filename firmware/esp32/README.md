# SeptiSense ESP32 Firmware & Hardware Wiring Guide

This directory contains the production C++ firmware for the **SeptiSense ESP32 IoT Edge Node**.

---

## ⚠️ CRITICAL ELECTRICAL SAFETY MANDATE (READ BEFORE CONNECTING ELECTRODES)

> [!CAUTION]
> **ELECTRICAL SAFETY PROTOCOL**:
> When testing with ECG electrode leads connected to a human subject:
> 1. **LAPTOP ON BATTERY POWER ONLY**: The laptop connected to the ESP32 via USB **MUST RUN STRICTLY ON ITS INTERNAL BATTERY WITH THE AC MAINS CHARGER UNPLUGGED**.
> 2. **OR USE A USB GALVANIC ISOLATOR**: If the host laptop must remain plugged into wall AC mains power, an ADuM3160 or ADuM4160-based **USB Galvanic Isolator** with $\ge 2.5\text{ kV}$ isolation MUST be inserted between the laptop USB port and the ESP32 node.
> 3. **LOW-VOLTAGE BATTERY MODULES ONLY**: Use only 3.3V low-voltage sensor breakout boards. No mains-referenced instrumentation or high-voltage equipment may touch the subject.
> 4. **HEALTHY VOLUNTEER TESTING ONLY**: This prototype is for educational research and hackathon demonstrations only. Never test on critically ill or unstable patients.
> 5. **ONE-TIME DASHBOARD SAFETY ACKNOWLEDGEMENT**: The web dashboard enforces a mandatory safety checklist acknowledgement before live ECG waveforms stream.

---

## Hardware Pin Connections

| Sensor / Peripheral | Sensor Pin | ESP32 GPIO | Description & Technical Notes |
| :--- | :--- | :--- | :--- |
| **AD8232 ECG** | `OUTPUT` | **GPIO 34** | ADC1_CH6 analog input (0–3.1V, 12-bit). ADC1 ensures no conflict with Wi-Fi. |
| **AD8232 ECG** | `LO+` | **GPIO 18** | Digital input. Active HIGH indicates Lead-Off detection on RA electrode. |
| **AD8232 ECG** | `LO-` | **GPIO 19** | Digital input. Active HIGH indicates Lead-Off detection on LA electrode. |
| **AD8232 ECG** | `3V3` | **3V3** | Clean 3.3V power rail from ESP32 LDO. |
| **AD8232 ECG** | `GND` | **GND** | System common ground. |
| **MAX30102 PPG** | `SDA` | **GPIO 21** | I2C Serial Data (400 kHz Fast Mode). |
| **MAX30102 PPG** | `SCL` | **GPIO 22** | I2C Serial Clock. |
| **MAX30102 PPG** | `VIN` | **3V3** | 3.3V power rail. |
| **MAX30102 PPG** | `GND` | **GND** | System common ground. |
| **DS18B20 Temp** | `DATA` | **GPIO 4** | 1-Wire bidirectional digital data (**requires 4.7kΩ pull-up resistor to 3.3V**). |
| **DS18B20 Temp** | `VDD` | **3V3** | 3.3V power rail. |
| **DS18B20 Temp** | `GND` | **GND** | System common ground. |
| **Alert LED** | Anode | **GPIO 2** | Onboard Blue Status LED (illuminates on active alert / leads-off). |
| **Alert Buzzer** | Signal | **GPIO 15** | Active 5V/3.3V piezo buzzer for audible alarm on persistent leads-off. |

---

## 3-Lead ECG Electrode Placement
- **RA (Right Arm / Red)**: Right infraclavicular fossa (just below the right clavicle).
- **LA (Left Arm / Yellow)**: Left infraclavicular fossa (just below the left clavicle).
- **RL (Right Leg / Green)**: Right lower abdomen (reference / ground electrode).

---

## Firmware Architecture & Features

1. **Hardware Timer Interrupt (250 Hz)**:
   - Configures ESP32 64-bit hardware Timer 0 with 80 prescaler (1 MHz tick rate).
   - Interrupt fires every 4,000 ticks (4.0 ms period = exactly 250 Hz).
   - Samples ADC1 Channel 6 into a non-blocking lockless ring buffer.
2. **On-Device QRS & Heart Rate Processing**:
   - High-pass moving-average baseline removal (100 ms window).
   - Difference derivative and squaring filter.
   - Adaptive threshold with refractory blanking period (250 ms) to reject T-wave false triggers.
   - Computes RR intervals and instantaneous heart rate (30–220 bpm).
3. **Primary Transport (USB Serial @ 921,600 baud)**:
   - Formats one newline-delimited JSON line per second (`\n` terminated).
   - Computes 32-bit CRC (`crc`) over the payload string for transmission verification.
   - If serial port is disconnected or backpressured, packets are enqueued into a RAM ring buffer (storing up to 180 seconds).
   - Flushes buffered records in strict chronological order with `buffered: true` upon link restoration.
4. **Fallback Transport (Wi-Fi HTTP POST)**:
   - Enable via `#define TRANSPORT_WIFI` in `config.h`.
   - Performs NTP time synchronization on boot.
   - POSTs identical JSON packets to `http://<LAPTOP_IP>:8000/api/telemetry`.

---

## Building and Flashing

### Using PlatformIO (Recommended)
```bash
cd firmware/esp32
# Copy configuration template
cp src/config.h.example src/config.h

# Compile and upload via USB
pio run --target upload

# Open high-speed serial monitor
pio device monitor -b 921600
```

### Using Arduino IDE
1. Install **ESP32 by Espressif Systems** via Board Manager.
2. Install required libraries from Library Manager:
   - `ArduinoJson` (v7.x)
   - `OneWire` (v2.3.x)
   - `DallasTemperature` (v3.11.x)
   - `SparkFun MAX3010x Pulse and Proximity Sensor Library` (v1.1.x)
3. Open `firmware/esp32/src/main.cpp`.
4. Select Board: **ESP32 Dev Module**.
5. Upload Speed: **921600**.
6. Compile and Upload.
