import { Socket as UdpSocket } from "dgram";
import { Socket as TcpSocket } from "net";
import { isBuffer, isNumber } from "util";
import { parseData, buildBcdDate, ipToHex } from "./utils";
import funcNames from "./funcNames";

export default class WgCtl {
  ip: string;
  port: number;
  serial: number;
  localSocket?: UdpSocket;
  remoteSocket?: TcpSocket;
  detected: Promise<boolean>;
  serverPort = 6000;

  constructor(
    socket: TcpSocket | UdpSocket,
    serial: number,
    ip = "",
    port = 60000
  ) {
    this.ip = ip;
    this.port = port;
    this.serial = serial;
    if (socket instanceof UdpSocket) {
      this.localSocket = socket;
    } else {
      this.remoteSocket = socket;
    }

    this.detected = Promise.resolve(!!ip);

    if (!this.ip && this.localSocket) {
      console.log("[WGC] Controller IP not defined, detecting...");
      this.detect();
    }
  }

  protected async detect() {
    this.search();
    this.detected = new Promise((resolve, reject) => {
      if (!this.localSocket) return;
      this.localSocket.once("message", (msg, rinfo) => {
        const data = parseData(msg) as {
          serial: number;
          ip: string;
          subNet: string;
          gateway: string;
          mac: string;
          version: string;
          release: string;
        };
        if (data.serial !== this.serial) return;
        console.log(
          `[WGC] Controller ${this.serial} detected, ip: ${data.ip}.`
        );
        this.ip = data.ip;
        resolve(true);
      });
    });
    await this.detected;
    this.setServerAddress("192.168.3.2", this.serverPort);
  }

  protected packData(funcCode: number, payload?: string | number | Buffer) {
    const data = Buffer.alloc(64);

    data.writeUInt8(0x17, 0);
    data.writeUInt8(funcCode, 1);
    data.writeUInt32LE(this.serial, 4);
    if (payload) {
      if (isBuffer(payload)) {
        data.fill(payload, 8, 8 + payload.byteLength);
      } else if (isNumber(payload)) {
        data.writeUInt8(payload, 8);
      } else {
        data.write(payload.replace(/\s/g, ""), 8, "hex");
      }
    } else {
      payload = Buffer.alloc(0);
    }

    const funcCodeStr = `0x${funcCode.toString(16).toUpperCase()}`;

    console.log(
      `[WGC] Func ${funcNames[funcCodeStr]}, payload to send:`,
      payload
    );

    return data;
  }

  sendData(funcCode: number, payload?: string | number | Buffer) {
    const data = this.packData(funcCode, payload);

    if (this.remoteSocket) {
      return this.remoteSendData(data);
    } else {
      return this.localSendData(data);
    }
  }

  protected remoteSendData(data: Buffer) {
    if (!this.remoteSocket) return;
    this.remoteSocket.write(data, err => {
      if (err) {
        console.error(err);
      }
    });
  }

  protected localSendData(data: Buffer) {
    if (!this.localSocket) return;
    if (!this.ip) {
      this.localSocket.setBroadcast(true);
    }

    this.localSocket.send(
      data,
      0,
      data.byteLength,
      this.port,
      this.ip || "255.255.255.255",
      (err, result) => {
        if (err) {
          console.error(err);
          if (!this.ip && this.localSocket) {
            this.localSocket.setBroadcast(false);
          }
        }
      }
    );
  }

  search() {
    this.sendData(0x94);
  }

  openDoor(door: number) {
    this.sendData(0x40, door);
  }

  getDate() {
    this.sendData(0x32);
  }

  setDate(date?: Date) {
    this.sendData(0x30, buildBcdDate(date || new Date()));
  }

  setAuth(cardNo: number) {
    const payload = Buffer.alloc(16);
    payload.writeUInt32LE(cardNo, 0);
    payload.write("20190101", 4, "hex");
    payload.write("20191231", 8, "hex");
    payload.writeUInt8(1, 12);
    payload.writeUInt8(1, 13);
    this.sendData(0x50, payload);
  }

  getAuth(cardNo: number) {
    const payload = Buffer.alloc(56);
    payload.writeUInt32LE(cardNo, 0);
    this.sendData(0x5a, payload);
  }

  removeAuth(cardNo: number) {
    const payload = Buffer.alloc(56);
    payload.writeUInt32LE(cardNo, 0);
    this.sendData(0x52, payload);
  }

  clearAuth() {
    const payload = Buffer.from("55aaaa55", "hex");
    this.sendData(0x54, payload);
  }

  setServerAddress(ip: string, port = 6000, interval = 0) {
    const payload = Buffer.alloc(7);
    payload.write(ipToHex(ip), "hex");
    payload.writeUInt16LE(port, 4);
    payload.writeUInt8(interval, 6);
    this.sendData(0x90, payload);
  }

  getServerAddress() {
    this.sendData(0x92);
  }
}
