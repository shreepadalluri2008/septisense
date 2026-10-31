import React, { useState, useEffect, useRef } from "react";
import { SerialStatus, ReplayStatus, DeviceInfo } from "../types";
import { Cpu, Radio, RefreshCw, Play, Square, CheckCircle2, AlertCircle, HardDrive, Zap, Info, Usb, Laptop } from "lucide-react";
import { api } from "../api";

interface SettingsDevicePageProps {
  serialStatus: SerialStatus | null;
  replayStatus: ReplayStatus | null;
  onRefreshStatus: () => void;
  selectedPatientId: number;
}

export const SettingsDevicePage: React.FC<SettingsDevicePageProps> = ({
  serialStatus,
  replayStatus,
  onRefreshStatus,
  selectedPatientId
}) => {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [autoBaudMode, setAutoBaudMode] = useState<boolean>(true);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [serialConnecting, setSerialConnecting] = useState(false);

  // Connection mode: 'browser' (for connecting to this laptop) or 'host' (for connecting to server machine)
  const [connectionMode, setConnectionMode] = useState<"browser" | "host">("browser");

  // Web Serial API (Direct USB connection from this laptop's browser)
  const isWebSerialSupported = typeof navigator !== "undefined" && "serial" in navigator;
  const [webSerialConnected, setWebSerialConnected] = useState(false);
  const [webSerialPackets, setWebSerialPackets] = useState(0);
  const [webSerialPort, setWebSerialPort] = useState<any>(null);
  const [webSerialConnecting, setWebSerialConnecting] = useState(false);
  const [webSerialError, setWebSerialError] = useState<string | null>(null);
  const webSerialReaderRef = useRef<any>(null);

  const handleConnectWebSerial = async () => {
    if (!isWebSerialSupported) {
      alert("Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.");
      return;
    }
    try {
      setWebSerialConnecting(true);
      setWebSerialError(null);
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: baudRate });
      setWebSerialPort(port);
      setWebSerialConnected(true);

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      webSerialReaderRef.current = reader;

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const payload = JSON.parse(trimmed);
              if (!payload.patient_id) {
                payload.patient_id = selectedPatientId;
              }
              await api.postTelemetry(payload);
              setWebSerialPackets((prev) => prev + 1);
            } catch (err) {
              // skip parse errors
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        setWebSerialError(err.message || "Failed to open Web Serial port");
      }
      setWebSerialConnected(false);
    } finally {
      setWebSerialConnecting(false);
    }
  };

  const handleDisconnectWebSerial = async () => {
    try {
      if (webSerialReaderRef.current) {
        await webSerialReaderRef.current.cancel();
      }
      if (webSerialPort) {
        await webSerialPort.close();
      }
    } catch (err) {
      console.warn("Error disconnecting Web Serial", err);
    } finally {
      setWebSerialConnected(false);
      setWebSerialPort(null);
    }
  };

  // Replay options
  const [replayRecordId, setReplayRecordId] = useState("p000001");
  const [replaySpeed, setReplaySpeed] = useState<number>(5.0);
  const [replayLoading, setReplayLoading] = useState(false);

  const fetchPorts = async () => {
    try {
      setLoadingPorts(true);
      const list = await api.getSerialPorts();
      setPorts(list);
      if (list.length > 0 && !selectedPort) {
        setSelectedPort(list[0]);
      }
    } catch (err) {
      console.error("Failed to scan ports", err);
    } finally {
      setLoadingPorts(false);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  const handleConnectSerial = async () => {
    if (!selectedPort) return;
    try {
      setSerialConnecting(true);
      await api.connectSerial(selectedPort, baudRate);
      onRefreshStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setSerialConnecting(false);
    }
  };

  const handleDisconnectSerial = async () => {
    try {
      setSerialConnecting(true);
      await api.disconnectSerial();
      onRefreshStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setSerialConnecting(false);
    }
  };

  const handleStartReplay = async () => {
    try {
      setReplayLoading(true);
      await api.startReplay(selectedPatientId, replayRecordId, replaySpeed, true);
      onRefreshStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setReplayLoading(false);
    }
  };

  const handleStopReplay = async () => {
    try {
      setReplayLoading(true);
      await api.stopReplay();
      onRefreshStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setReplayLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Telemetry Ingest & Hardware Control</h2>
            <p className="text-xs text-slate-400">
              Manage ESP32 USB serial link (flexible baud rate — auto-matches your ESP32 firmware) and PhysioNet CinC 2019 Replay Engine
            </p>
          </div>
        </div>

        <button
          onClick={onRefreshStatus}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4 text-cyan-400" />
          <span>Refresh Hardware Status</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: USB Serial Hardware Link */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                ESP32 Serial Ingest (Flexible Baud Rate)
              </h3>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                (connectionMode === "browser" ? webSerialConnected : serialStatus?.is_connected)
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              {(connectionMode === "browser" ? webSerialConnected : serialStatus?.is_connected)
                ? "PORT CONNECTED"
                : "PORT DISCONNECTED"}
            </span>
          </div>

          {/* Connection Mode Selector Tabs */}
          <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700">
            <button
              type="button"
              onClick={() => setConnectionMode("browser")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                connectionMode === "browser"
                  ? "bg-cyan-500 text-slate-950 font-bold shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Connect to THIS Laptop (Web Serial)</span>
            </button>
            <button
              type="button"
              onClick={() => setConnectionMode("host")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                connectionMode === "host"
                  ? "bg-cyan-500 text-slate-950 font-bold shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Connect to Server Host (PySerial)</span>
            </button>
          </div>

          {/* Tab Content: Mode A - Browser Web Serial (For client laptop with USB) */}
          {connectionMode === "browser" && (
            <div className="space-y-4 text-xs">
              {/* Flexible Baud Rate Selector for Web Serial */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-semibold">Flexible ESP32 Baud Rate (1,00,000+ Adaptive)</label>
                  <label className="flex items-center gap-1.5 text-[11px] text-emerald-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoBaudMode}
                      onChange={(e) => setAutoBaudMode(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Auto-Adapt to ESP32 Sensor</span>
                  </label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={baudRate}
                    onChange={(e) => setBaudRate(Number(e.target.value))}
                    disabled={webSerialConnected}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  >
                    <option value={100000}>1,00,000 (100k Baud)</option>
                    <option value={115200}>1,15,200 (ESP32 Standard 1.15L)</option>
                    <option value={128000}>1,28,000 (1.28L Baud)</option>
                    <option value={230400}>2,30,400 (2.30L Baud)</option>
                    <option value={250000}>2,50,000 (2.50L Baud)</option>
                    <option value={460800}>4,60,800 (4.60L Baud)</option>
                    <option value={500000}>5,00,000 (5.00L Baud)</option>
                    <option value={921600}>9,21,600 (9.21L High-Speed)</option>
                    <option value={1000000}>10,00,000 (1M Baud)</option>
                    <option value={1500000}>15,00,000 (1.5M Baud)</option>
                    <option value={2000000}>20,00,000 (2M Baud)</option>
                  </select>
                  <input
                    type="number"
                    min={9600}
                    max={5000000}
                    step={100}
                    value={baudRate}
                    onChange={(e) => setBaudRate(Math.max(9600, Number(e.target.value) || 115200))}
                    disabled={webSerialConnected}
                    placeholder="Custom baud (e.g. 115200)"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Flexible baud rate automatically adapts to your ESP32 sensor (~1,00,000+ / 1,15,200 baud or any custom value).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Usb className="w-4 h-4 text-cyan-400" /> Plug ESP32 Directly into This Laptop
                </p>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Your browser (Chrome, Edge, Opera) will communicate directly with the USB port on this laptop at <span className="font-mono font-bold text-cyan-300">{baudRate.toLocaleString()} baud</span> and stream telemetry to the platform in real time. Zero software installation required on this device.
                </p>
              </div>

              {!isWebSerialSupported && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Web Serial API is not supported in this browser. Please open this page in Google Chrome, Microsoft Edge, or Opera.</span>
                </div>
              )}

              {webSerialError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {webSerialError}
                </div>
              )}

              {/* Web Serial Metrics */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 font-mono text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Connection Transport:</span>
                  <span className="font-bold text-cyan-300">Browser Web Serial ({baudRate.toLocaleString()} Baud)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Packets Ingested to Server:</span>
                  <span className="font-bold text-emerald-400">{webSerialPackets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hardware Status:</span>
                  <span className={webSerialConnected ? "text-emerald-400 font-bold" : "text-slate-400"}>
                    {webSerialConnected ? "Active & Streaming 250 Hz" : "Waiting for USB selection"}
                  </span>
                </div>
              </div>

              {/* Connect / Disconnect Buttons */}
              <div className="pt-2">
                {webSerialConnected ? (
                  <button
                    onClick={handleDisconnectWebSerial}
                    className="w-full py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold uppercase tracking-wider text-xs transition-all cursor-pointer shadow-md"
                  >
                    Disconnect Browser Serial Link
                  </button>
                ) : (
                  <button
                    onClick={handleConnectWebSerial}
                    disabled={!isWebSerialSupported || webSerialConnecting}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Usb className="w-4 h-4" />
                    <span>{webSerialConnecting ? "Requesting USB Port..." : `Select & Connect USB Port (${baudRate.toLocaleString()} Baud)`}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab Content: Mode B - Server Host PySerial (When plugged into the host computer) */}
          {connectionMode === "host" && (
            <div className="space-y-4 text-xs">
              <p className="text-slate-400">
                Connects to USB serial ports physically plugged into the computer running the FastAPI server.
              </p>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-semibold">Available Server Serial Ports</label>
                  <button
                    onClick={fetchPorts}
                    disabled={loadingPorts}
                    className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingPorts ? "animate-spin" : ""}`} /> Scan Ports
                  </button>
                </div>

                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  disabled={serialStatus?.is_connected}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                >
                  {ports.length > 0 ? (
                    ports.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))
                  ) : (
                    <option value="">No USB serial devices detected on server host</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Flexible Baud Rate (1,00,000+)</label>
                  <div className="flex gap-2">
                    <select
                      value={baudRate}
                      onChange={(e) => setBaudRate(Number(e.target.value))}
                      disabled={serialStatus?.is_connected}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                    >
                      <option value={0}>Auto-Detect (1,00,000+)</option>
                      <option value={100000}>1,00,000 (100k)</option>
                      <option value={115200}>1,15,200 (ESP32 1.15L)</option>
                      <option value={128000}>1,28,000</option>
                      <option value={230400}>2,30,400</option>
                      <option value={250000}>2,50,000</option>
                      <option value={460800}>4,60,800</option>
                      <option value={500000}>5,00,000</option>
                      <option value={921600}>9,21,600</option>
                      <option value={1000000}>10,00,000 (1M)</option>
                      <option value={2000000}>20,00,000 (2M)</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      max={5000000}
                      step={100}
                      value={baudRate}
                      onChange={(e) => setBaudRate(Math.max(0, Number(e.target.value)))}
                      disabled={serialStatus?.is_connected}
                      placeholder="Baud"
                      className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">CRC Validation</label>
                  <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-emerald-400 text-sm font-mono flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> CRC32 Enforced
                  </div>
                </div>
              </div>

              {/* Serial Metrics */}
              <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-2 font-mono text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Lines Ingested:</span>
                  <span className="font-bold text-cyan-300">{serialStatus?.lines_received ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">CRC Checksum Failures:</span>
                  <span className="font-bold text-rose-400">{serialStatus?.bad_crc_count ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Last Telemetry Stamp:</span>
                  <span className="text-slate-300">
                    {serialStatus?.last_line_ts
                      ? new Date(serialStatus.last_line_ts).toLocaleTimeString()
                      : "No data received"}
                  </span>
                </div>
              </div>

              {/* Connect / Disconnect Actions */}
              <div className="pt-2">
                {serialStatus?.is_connected ? (
                  <button
                    onClick={handleDisconnectSerial}
                    disabled={serialConnecting}
                    className="w-full py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold uppercase tracking-wider text-xs transition-all cursor-pointer"
                  >
                    {serialConnecting ? "Disconnecting..." : "Disconnect Serial Link"}
                  </button>
                ) : (
                  <button
                    onClick={handleConnectSerial}
                    disabled={serialConnecting || !selectedPort}
                    className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {serialConnecting ? "Connecting..." : "Open Serial Connection"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: PhysioNet Replay Engine */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                PhysioNet CinC 2019 Replay Engine
              </h3>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                replayStatus?.is_active
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              {replayStatus?.is_active ? "STREAMING REPLAY" : "REPLAY INACTIVE"}
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <p className="text-slate-400">
              Streams verified multi-hour patient files directly from PhysioNet CinC 2019. Zero synthetic data. All incoming packets are marked with <code>is_replay: true</code>.
            </p>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                PhysioNet Patient Record ID
              </label>
              <select
                value={replayRecordId}
                onChange={(e) => setReplayRecordId(e.target.value)}
                disabled={replayStatus?.is_active}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm font-mono focus:outline-none focus:border-cyan-400 disabled:opacity-50"
              >
                <option value="p000001">p000001 – Hospital A ICU Record</option>
                <option value="p000002">p000002 – Hospital A Patient</option>
                <option value="p000005">p000005 – Hospital A Patient</option>
                <option value="p000010">p000010 – Hospital A Patient</option>
                <option value="p010001">p010001 – Hospital B Cross-System Record</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-300 font-semibold">
                  Replay Speed Factor
                </label>
                {replayStatus?.is_active && (
                  <span className="text-[11px] text-amber-400 font-mono">
                    Active: {replayStatus.speed_factor}x
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { factor: 1.0, label: "1x (Real-time)" },
                  { factor: 5.0, label: "5x Speed" },
                  { factor: 10.0, label: "10x Speed" },
                  { factor: 60.0, label: "60x Speed" }
                ].map((s) => (
                  <button
                    key={s.factor}
                    type="button"
                    onClick={async () => {
                      setReplaySpeed(s.factor);
                      if (replayStatus?.is_active) {
                        try {
                          await api.setReplaySpeed(s.factor);
                          onRefreshStatus();
                        } catch (err) {
                          console.error("Failed to update replay speed", err);
                        }
                      }
                    }}
                    className={`py-2 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                      (replayStatus?.is_active ? replayStatus.speed_factor === s.factor : replaySpeed === s.factor)
                        ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20 ring-2 ring-amber-400"
                        : "bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Replay Progress */}
            {replayStatus?.is_active && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 font-mono text-amber-200">
                <div className="flex justify-between">
                  <span>Record:</span>
                  <span className="font-bold">{replayStatus.record_id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Hospital Hour:</span>
                  <span className="font-bold">
                    Hour {replayStatus.current_hour} of {replayStatus.total_hours}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{
                      width: `${(replayStatus.current_hour / Math.max(1, replayStatus.total_hours)) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}

            {/* Start / Stop Replay Actions */}
            <div className="pt-2">
              {replayStatus?.is_active ? (
                <button
                  onClick={handleStopReplay}
                  disabled={replayLoading}
                  className="w-full py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold uppercase tracking-wider text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop PhysioNet Replay Stream</span>
                </button>
              ) : (
                <button
                  onClick={handleStartReplay}
                  disabled={replayLoading}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-wider text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Historical PhysioNet Replay</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
