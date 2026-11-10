import { CMD } from '../protocol/escpos.js';
import { store } from '../state/store.js';

export const PRIMARY_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
export const WRITE_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';
export const NOTIFY_CHAR_UUID = '00002af0-0000-1000-8000-00805f9b34fb';

class BleClient {
  constructor() {
    this.device = null;
    this.server = null;
    this.writeChar = null;
    this.notifyChar = null;

    this.notifyBuffer = [];
    this.notifyWaitResolver = null;
    this.heartbeatTimer = null;
    this.abortController = null;
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connect() {
    if (!this.isSupported()) {
      throw new Error(
        'Your browser does not support the Web Bluetooth API. Please enable Bluetooth in Chrome, Edge, or Samsung Internet on Android / desktop.'
      );
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'FICHERO' },
          { namePrefix: 'D11s_' },
          { namePrefix: 'PeriPage' },
        ],
        optionalServices: [PRIMARY_SERVICE_UUID, '0000ff00-0000-1000-8000-00805f9b34fb'],
      });
    } catch (e) {
      if (e.name === 'NotFoundError') {
        throw new Error('Bluetooth device selection was cancelled.');
      }
      throw e;
    }

    this.device.addEventListener('gattserverdisconnected', () => {
      this.handleDisconnected();
    });

    if (!this.device.gatt) {
      throw new Error('Device does not have a GATT interface.');
    }

    this.server = await this.device.gatt.connect();

    // Primary Service & Characteristics
    const service = await this.server.getPrimaryService(PRIMARY_SERVICE_UUID);
    this.writeChar = await service.getCharacteristic(WRITE_CHAR_UUID);
    this.notifyChar = await service.getCharacteristic(NOTIFY_CHAR_UUID);

    // Notifications
    await this.notifyChar.startNotifications();
    this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
      const val = new Uint8Array(event.target.value.buffer);
      this.handleNotification(val);
    });

    store.update({
      connected: true,
      deviceName: this.device.name || 'FICHERO 6181',
    });

    await this.refreshStatus();
    this.startHeartbeat();

    return true;
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnected();
  }

  handleDisconnected() {
    this.stopHeartbeat();
    this.device = null;
    this.server = null;
    this.writeChar = null;
    this.notifyChar = null;

    store.update({
      connected: false,
      deviceName: null,
      batteryPercent: null,
      isPrinting: false,
      isCoverOpen: false,
      isNoPaper: false,
      isOverheated: false,
      isCharging: false,
    });
  }

  handleNotification(data) {
    this.notifyBuffer.push(...data);
    if (this.notifyWaitResolver) {
      const copy = new Uint8Array(this.notifyBuffer);
      this.notifyBuffer = [];
      this.notifyWaitResolver(copy);
      this.notifyWaitResolver = null;
    }
  }

  async sendCommand(cmd, waitForResponse = false, timeoutMs = 2000) {
    if (!this.writeChar) throw new Error('Printer is not connected.');

    if (waitForResponse) {
      this.notifyBuffer = [];
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.notifyWaitResolver = null;
          reject(new Error(`Response timeout (${timeoutMs}ms)`));
        }, timeoutMs);

        this.notifyWaitResolver = (response) => {
          clearTimeout(timer);
          resolve(response);
        };

        this.writeChar.writeValueWithoutResponse(cmd).catch(reject);
      });
    } else {
      await this.writeChar.writeValueWithoutResponse(cmd);
      return new Uint8Array(0);
    }
  }

  async refreshStatus() {
    if (!store.get('connected')) return;

    try {
      // 1. Model
      try {
        const modelBytes = await this.sendCommand(CMD.getModel, true, 800);
        store.set('model', new TextDecoder().decode(modelBytes).trim());
      } catch {}

      // 2. Battery
      try {
        const battBytes = await this.sendCommand(CMD.getBattery, true, 800);
        if (battBytes.length >= 2) {
          store.set('batteryPercent', battBytes[battBytes.length - 1]);
        }
      } catch {}

      // 3. Status bitmask
      try {
        const statusBytes = await this.sendCommand(CMD.getStatus, true, 800);
        if (statusBytes.length >= 1) {
          const raw = statusBytes[statusBytes.length - 1];
          store.update({
            isPrinting: Boolean(raw & 0x01),
            isCoverOpen: Boolean(raw & 0x02),
            isNoPaper: Boolean(raw & 0x04),
            isOverheated: Boolean(raw & 0x10 || raw & 0x40),
            isCharging: Boolean(raw & 0x20),
          });
        }
      } catch {}
    } catch (e) {
      console.warn('Error refreshing printer status:', e);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.refreshStatus();
    }, 15000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  cancelPrint() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async executePrint(rasterPayload, onProgress) {
    if (!this.writeChar) throw new Error('Printer is not connected!');

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Check printer hardware state
    await this.refreshStatus();
    if (store.get('isCoverOpen')) throw new Error('Printer cover is open!');
    if (store.get('isNoPaper')) throw new Error('Printer is out of paper!');
    if (store.get('isOverheated')) throw new Error('Printhead is overheated! Please wait a moment.');

    const delay = (ms) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('Print job was cancelled by user.'));
        });
      });

    const pacing = {
      chunkSize: store.get('chunkSize') || 200,
      chunkDelayMs: store.get('chunkDelayMs') || 20,
      density: store.get('density') ?? 2,
      paperType: store.get('paperType') ?? 2,
      copies: store.get('copies') || 1,
    };

    const total = rasterPayload.length;

    onProgress?.({
      active: true,
      currentBytes: 0,
      totalBytes: total,
      percent: 0,
      statusText: 'Initializing printer and applying density settings...',
    });

    for (let copy = 1; copy <= pacing.copies; copy++) {
      // 1. Set density
      await this.sendCommand(CMD.setDensity(pacing.density));
      await delay(80);

      // 2. Set continuous roll paper (0x02)
      await this.sendCommand(CMD.setPaperType(pacing.paperType));
      await delay(50);

      // 3. Wakeup
      await this.sendCommand(CMD.wakeup);
      await delay(50);

      // 4. Enable printer (AiYin: 10 FF FE 01)
      await this.sendCommand(CMD.enablePrinter);
      await delay(50);

      // 5. Send chunks with pacing
      const startTime = Date.now();
      const chunkSize = pacing.chunkSize;

      for (let offset = 0; offset < total; offset += chunkSize) {
        if (signal.aborted) throw new Error('Print job cancelled.');

        const chunk = rasterPayload.subarray(offset, Math.min(offset + chunkSize, total));
        await this.writeChar.writeValueWithoutResponse(chunk);

        const current = offset + chunk.length;
        const elapsed = (Date.now() - startTime) / 1000;
        const bytesPerSec = current / (elapsed || 0.001);
        const remSec = Math.max(0, Math.ceil((total - current) / bytesPerSec));

        onProgress?.({
          active: true,
          currentBytes: current,
          totalBytes: total,
          percent: Math.round((current / total) * 100),
          statusText: `Transmitting data [Copy ${copy}/${pacing.copies}] (${Math.round(
            current / 1024
          )} / ${Math.round(total / 1024)} KB)...`,
          remSec,
        });

        if (pacing.chunkDelayMs > 0) {
          await delay(pacing.chunkDelayMs);
        }
      }

      // 6. Settle
      onProgress?.({
        active: true,
        currentBytes: total,
        totalBytes: total,
        percent: 99,
        statusText: 'Waiting for printhead to finish thermal heating...',
        remSec: 2,
      });
      await delay(500);

      // 7. Stop print (AiYin: 10 FF FE 45) -> wait for 0xAA / OK
      try {
        await this.sendCommand(CMD.stopPrint, true, 20000);
      } catch (e) {
        console.warn('No 0xAA acknowledgment received after stop_print:', e);
      }
    }

    onProgress?.({
      active: false,
      currentBytes: total,
      totalBytes: total,
      percent: 100,
      statusText: 'Print completed successfully!',
    });
  }

  async feedPaper(mm) {
    const dots = Math.round(mm * 8);
    let remaining = dots;
    while (remaining > 0) {
      const step = Math.min(250, remaining);
      await this.sendCommand(CMD.feedDots(step));
      remaining -= step;
      await new Promise((r) => setTimeout(r, 60));
    }
  }
}

export const bleClient = new BleClient();
