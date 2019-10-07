import { Socket as UdpSocket } from "dgram";
import { Socket as TcpSocket } from "net";
import { isBuffer, isNumber } from "util";
import { buildBcdDate, ipToHex } from "./utils";
import funcNames from "./funcNames";

const { WGC_HIDE_LOG, WGC_DISABLE_ECHO } = process.env;

export default class WgCtl {
  ip: string;
  port: number;
  serial?: number;
  localSocket?: UdpSocket;
  remoteSocket?: TcpSocket;
  serverIp?: string;
  serverPort?: number;

  constructor(
    socket: TcpSocket | UdpSocket,
    serial?: number,
    serverIp?: string,
    serverPort?: number,
    ip = "",
    port = 60000
  ) {
    this.ip = ip;
    this.port = port;
    this.serial = serial;
    if (socket instanceof UdpSocket) {
      this.localSocket = socket;
      // server ip and port only available for local mode
      this.serverIp = serverIp;
      this.serverPort = serverPort;
    } else {
      this.remoteSocket = socket;
      if (this.serverIp || this.serverPort) {
        throw new Error("Server ip and port only available for local mode.");
      }
    }
  }

  protected packData(funcCode: number, payload?: string | number | Buffer) {
    const data = Buffer.alloc(64);

    data.writeUInt8(0x17, 0);
    data.writeUInt8(funcCode, 1);
    if (this.serial) {
      data.writeUInt32LE(this.serial, 4);
    }
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

    if (!WGC_HIDE_LOG) {
      console.log(
        `[WGC] Func ${funcNames[funcCodeStr]}, controller ${this.serial ||
          "all"}, payload to send:`,
        payload
      );
    }

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

  protected localSendData(data: Buffer, isEcho = false) {
    if (!this.localSocket) return;
    if (!this.ip) {
      this.localSocket.setBroadcast(true);
    }
    if (!WGC_HIDE_LOG) {
      console.log(
        `[WGC] Sending local data to ${this.ip || "255.255.255.255"}.`
      );
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

    if (!isEcho && !WGC_DISABLE_ECHO) {
      setTimeout(() => {
        this.localSendData(data, true);
        setTimeout(() => {
          this.localSendData(data, true);
          setTimeout(() => {
            this.localSendData(data, true);
          }, 29000);
        }, 17000);
      }, 7000);
    }
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

  setAuth(cardNo: number, door?: number) {
    const payload = Buffer.alloc(16);
    payload.writeUInt32LE(cardNo, 0);
    payload.write("20190101", 4, "hex");
    payload.write("20291231", 8, "hex");
    payload.writeUInt8(door && door !== 1 ? 0 : 1, 12);
    payload.writeUInt8(door && door !== 2 ? 0 : 1, 13);
    payload.writeUInt8(door && door !== 3 ? 0 : 1, 14);
    payload.writeUInt8(door && door !== 4 ? 0 : 1, 15);
    this.sendData(0x50, payload);
  }

  getAuth(cardNo: number) {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(cardNo, 0);
    this.sendData(0x5a, payload);
  }

  removeAuth(cardNo: number) {
    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(cardNo, 0);
    this.sendData(0x52, payload);
  }

  clearAuth() {
    const payload = Buffer.from("55aaaa55", "hex");
    this.sendData(0x54, payload);
  }

  setServerAddress(ip: string, port: number, interval = 0) {
    const payload = Buffer.alloc(7);
    payload.write(ipToHex(ip), "hex");
    payload.writeUInt16LE(port, 4);
    payload.writeUInt8(interval, 6);
    this.sendData(0x90, payload);
  }

  setAddress(ip: string, subnet: string, gateway: string) {
    const payload = Buffer.alloc(16);
    payload.write(ipToHex(ip), "hex");
    payload.write(ipToHex(subnet), 4, "hex");
    payload.write(ipToHex(gateway), 8, "hex");
    payload.write("55aaaa55", 12, "hex");
    this.sendData(0x96, payload);
    this.ip = "";
  }

  getServerAddress() {
    this.sendData(0x92);
  }
}
