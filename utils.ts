import moment from "moment";
import "moment-timezone";
import funcNames from "./funcNames";

export function parseData(data: Buffer) {
  const funcCode =
    "0x" +
    data
      .slice(1, 2)
      .toString("hex")
      .toUpperCase();
  const serial = data.readUInt32LE(4);
  const payload = data.slice(8);
  return { serial, ...payloadParser(funcCode, payload) };
}

export function payloadParser(funcCode: string, payload: Buffer): any {
  switch (funcCode) {
    case "0x20":
      const types = ["none", "card", "open", "alert"];
      const index = payload.readUInt32LE(0);
      const type = payload.readUInt8(4);
      const allow = payload.readUInt8(5);
      const door = payload.readUInt8(6);
      const inOut = payload.readUInt8(7);
      const cardNo = payload.readUInt32LE(8);
      const time = payload.slice(12, 19);

      // console.log("[DEBUG] Card No. hex is: ", payload.slice(8, 12));

      return {
        funcName: funcNames[funcCode],
        index,
        type: types[type],
        allow: !!allow,
        door,
        inOut: inOut === 1 ? "in" : "out",
        cardNo,
        time: parseBcdDate(time)
      };
    case "0x32":
      const date = payload.slice(0, 7);
      return {
        funcName: funcNames[funcCode],
        date: !!parseBcdDate(date)
      };
    case "0x40":
      return {
        funcName: funcNames[funcCode],
        success: payload.readUInt8(0)
      };
    case "0x50":
      return {
        funcName: funcNames[funcCode],
        success: !!payload.readUInt8(0)
      };
    case "0x52":
      return {
        funcName: funcNames[funcCode],
        success: !!payload.readUInt8(0)
      };
    case "0x54":
      return {
        funcName: funcNames[funcCode],
        success: !!payload.readUInt8(0)
      };
    case "0x5A":
      return {
        funcName: funcNames[funcCode],
        cardNo: payload.readUInt32LE(0) || null,
        from: payload.slice(4, 8).toString("hex"),
        to: payload.slice(8, 12).toString("hex")
      };
    case "0x90":
      return {
        funcName: funcNames[funcCode],
        success: !!payload.readUInt8(0)
      };
    case "0x92":
      return {
        funcName: funcNames[funcCode],
        ip: hexToIp(payload.slice(0, 4).toString("hex")),
        port: payload.readUInt16LE(4),
        interval: payload.readUInt8(6)
      };
    case "0x94":
      return {
        funcName: funcNames[funcCode],
        ip: hexToIp(payload.slice(0, 4).toString("hex")),
        subNet: hexToIp(payload.slice(4, 8).toString("hex")),
        gateway: hexToIp(payload.slice(8, 12).toString("hex")),
        mac: (
          payload
            .slice(12, 18)
            .toString("hex")
            .toUpperCase()
            .match(/.{1,2}/g) || []
        ).join(":"),
        version: +payload.slice(18, 20).toString("hex") / 100,
        release: payload.slice(20, 24).toString("hex")
      };
    case "0x96":
      return {
        funcName: funcNames[funcCode],
        ip: hexToIp(payload.slice(0, 4).toString("hex")),
        subNet: hexToIp(payload.slice(4, 8).toString("hex")),
        gateway: hexToIp(payload.slice(8, 12).toString("hex"))
      };
    default:
      return {
        funcName: `Unknown (${funcCode})`,
        data: payload
      };
  }
}

export function parseBcdDate(bcd: Buffer): Date {
  // console.log("BCD Date:", bcd);
  return moment
    .tz(bcd.toString("hex"), "YYYYMMDDHHmmss", "Asia/Shanghai")
    .toDate();
}

export function buildBcdDate(date: Date): Buffer {
  const str = moment(date)
    .tz("Asia/Shanghai")
    .format("YYYYMMDDHHmmss");
  return Buffer.from(str, "hex");
}

export function hexStringToDecArray(hexString: string) {
  const matches = hexString.match(/.{1,2}/g);
  if (!matches) {
    return [];
  }
  return matches.map(byteString => parseInt(byteString, 16));
}

export function decArrayToHexString(decArray: number[]): string {
  const hex = decArray.map(d => d.toString(16).padStart(2, "0")).join("");
  return hex;
}

export function ipToHex(ip: string): string {
  return decArrayToHexString(ip.split(".").map(d => +d));
}

export function hexToIp(hex: string): string {
  return hexStringToDecArray(hex).join(".");
}
