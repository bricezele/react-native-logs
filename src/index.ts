/**
 * REACT-NATIVE-LOGS
 * Alessandro Bottamedi - a.bottamedi@me.com
 *
 * Performance-aware simple logger for React-Native with custom levels and transports (colored console, file writing, etc.)
 *
 * MIT license
 *
 * Copyright (c) 2021 Alessandro Bottamedi.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/** Import preset transports */
import { consoleTransport } from "./transports/consoleTransport";
import { mapConsoleTransport } from "./transports/mapConsoleTransport";
import { fileAsyncTransport } from "./transports/fileAsyncTransport";
import { sentryTransport } from "./transports/sentryTransport";

let asyncFunc = (cb: Function) => {
  setTimeout(() => {
    return cb();
  }, 0);
};

let stringifyFunc = (msg: any): string => {
  let stringMsg = "";
  if (typeof msg === "string") {
    stringMsg = msg + " ";
  } else if (typeof msg === "function") {
    stringMsg = "[function] ";
  } else if (msg && msg.stack && msg.message) {
    stringMsg = msg.message + " ";
  } else {
    try {
      stringMsg = "\n" + JSON.stringify(msg, undefined, 2) + "\n";
    } catch (error) {
      stringMsg += "Undefined Message";
    }
  }
  return stringMsg;
};

/** Types Declaration */
type transportFunctionType = (props: {
  msg: any;
  rawMsg: any;
  level: { severity: number; text: string };
  extension?: string | null;
  options?: any;
}) => any;
type levelsType = { [key: string]: number };
type logMethodType = (
  level: string,
  extension: string | null,
  ...msgs: any[]
) => boolean;
type levelLogMethodType = (...msgs: any[]) => boolean;
type extendedLogType = { [key: string]: levelLogMethodType | any };
type configLoggerType = {
  severity?: string;
  transport?: transportFunctionType | transportFunctionType[];
  transportOptions?: any;
  levels?: levelsType;
  async?: boolean;
  asyncFunc?: Function;
  stringifyFunc?: (msg: any) => string;
  dateFormat?: string | ((date: Date) => string); //"time" | "local" | "utc" | "iso" | "function";
  printLevel?: boolean;
  printDate?: boolean;
  enabled?: boolean;
  enabledExtensions?: string[] | string | null;
};

/** Reserved key log string to avoid overwriting other methods or properties */
const reservedKey: string[] = [
  "extend",
  "enable",
  "disable",
  "getExtensions",
  "setSeverity",
  "getSeverity",
  "patchConsole",
  "getOriginalConsole",
];

/** Default configuration parameters for logger */
const defaultLogger = {
  severity: "debug",
  transport: consoleTransport,
  transportOptions: {},
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  },
  async: false,
  asyncFunc: asyncFunc,
  stringifyFunc: stringifyFunc,
  printLevel: true,
  printDate: true,
  dateFormat: "time",
  enabled: true,
  enabledExtensions: null,
  printFileLine: false,
  fileLineOffset: 0,
};

/** Logger Main Class */
class logs {
  private _levels: levelsType;
  private _level: string;
  private _transport: transportFunctionType | transportFunctionType[];
  private _transportOptions: any;
  private _async: boolean;
  private _asyncFunc: Function;
  private _stringifyFunc: (msg: any) => string | any;
  private _dateFormat: string | ((date: Date) => string);
  private _printLevel: boolean;
  private _printDate: boolean;
  private _enabled: boolean;
  private _enabledExtensions: string[] | null = null;
  private _extensions: string[] = [];
  private _extendedLogs: { [key: string]: extendedLogType } = {};
  private _originalConsole?: typeof console;

  constructor(config: Required<configLoggerType>) {
    this._levels = config.levels;
    this._level = config.severity ?? Object.keys(this._levels)[0];

    this._transport = config.transport;
    this._transportOptions = config.transportOptions;

    this._asyncFunc = config.asyncFunc;
    this._async = config.async;

    this._stringifyFunc = config.stringifyFunc;

    this._dateFormat = config.dateFormat;

    this._printLevel = config.printLevel;
    this._printDate = config.printDate;

    this._enabled = config.enabled;

    if (Array.isArray(config.enabledExtensions)) {
      this._enabledExtensions = config.enabledExtensions;
    } else if (typeof config.enabledExtensions === "string") {
      this._enabledExtensions = [config.enabledExtensions];
    }

    /** Bind correct log levels methods */
    let _this: any = this;
    Object.keys(this._levels).forEach((level: string) => {
      if (typeof level !== "string") {
        throw Error(`[react-native-logs] ERROR: levels must be strings`);
      }
      if (level[0] === "_") {
        throw Error(
          `[react-native-logs] ERROR: keys with first char "_" is reserved and cannot be used as levels`
        );
      }
      if (reservedKey.indexOf(level) !== -1) {
        throw Error(
          `[react-native-logs] ERROR: [${level}] is a reserved key, you cannot set it as custom level`
        );
      }
      if (typeof this._levels[level] === "number") {
        _this[level] = this._log.bind(this, level, null);
      } else {
        throw Error(`[react-native-logs] ERROR: [${level}] wrong level config`);
      }
    }, this);
  }

  /** Log messages methods and level filter */
  private _log: logMethodType = (level, extension, ...msgs) => {
    if (this._async) {
      return this._asyncFunc(() => {
        this._sendToTransport(level, extension, msgs);
      });
    } else {
      return this._sendToTransport(level, extension, msgs);
    }
  };

  private _sendToTransport = (
    level: string,
    extension: string | null,
    msgs: any
  ) => {
    if (!this._enabled) return false;
    if (!this._isLevelEnabled(level)) {
      return false;
    }
    if (extension && !this._isExtensionEnabled(extension)) {
      return false;
    }
    let msg = this._formatMsg(level, extension, msgs);
    let transportProps = {
      msg: msg,
      rawMsg: msgs,
      level: { severity: this._levels[level], text: level },
      extension: extension,
      options: this._transportOptions,
    };
    if (Array.isArray(this._transport)) {
      for (let i = 0; i < this._transport.length; i++) {
        this._transport[i](transportProps);
      }
    } else {
      this._transport(transportProps);
    }
    return true;
  };

  private _stringifyMsg = (msg: any): string => {
    return this._stringifyFunc(msg);
  };

  private _formatMsg = (
    level: string,
    extension: string | null,
    msgs: any
  ): string => {
    let nameTxt: string = "";
    if (extension) {
      nameTxt = `${extension} | `;
    }

    let dateTxt: string = "";
    if (this._printDate) {
      if (typeof this._dateFormat === "string") {
        switch (this._dateFormat) {
          case "time":
            dateTxt = `${new Date().toLocaleTimeString()} | `;
            break;
          case "local":
            dateTxt = `${new Date().toLocaleString()} | `;
            break;
          case "utc":
            dateTxt = `${new Date().toUTCString()} | `;
            break;
          case "iso":
            dateTxt = `${new Date().toISOString()} | `;
            break;
          default:
            break;
        }
      } else if (typeof this._dateFormat === "function") {
        dateTxt = this._dateFormat(new Date());
      }
    }

    let levelTxt = "";
    if (this._printLevel) {
      levelTxt = `${level.toUpperCase()} : `;
    }

    let stringMsg: string = dateTxt + nameTxt + levelTxt;

    if (Array.isArray(msgs)) {
      for (let i = 0; i < msgs.length; ++i) {
        stringMsg += this._stringifyMsg(msgs[i]);
      }
    } else {
      stringMsg += this._stringifyMsg(msgs);
    }

    return stringMsg;
  };

  /** Return true if level is enabled */
  private _isLevelEnabled = (level: string): boolean => {
    if (this._levels[level] < this._levels[this._level]) {
      return false;
    }
    return true;
  };

  /** Return true if extension is enabled */
  private _isExtensionEnabled = (extension: string): boolean => {
    if (!this._enabledExtensions) {
      return true;
    }
    if (this._enabledExtensions.includes(extension)) {
      return true;
    }
    return false;
  };

  /** Extend logger with a new extension */
  extend = (extension: string): extendedLogType => {
    if (extension === "console") {
      throw Error(
        `[react-native-logs:extend] ERROR: you cannot set [console] as extension, use patchConsole instead`
      );
    }
    if (this._extensions.includes(extension)) {
      return this._extendedLogs[extension];
    }
    this._extendedLogs[extension] = {};
    this._extensions.push(extension);
    let extendedLog = this._extendedLogs[extension];
    Object.keys(this._levels).forEach((level: string) => {
      extendedLog[level] = (...msgs: any) => {
        this._log(level, extension, ...msgs);
      };
      extendedLog["extend"] = (extension: string) => {
        throw Error(
          `[react-native-logs] ERROR: you cannot extend a logger from an already extended logger`
        );
      };
      extendedLog["enable"] = () => {
        throw Error(
          `[react-native-logs] ERROR: You cannot enable a logger from extended logger`
        );
      };
      extendedLog["disable"] = () => {
        throw Error(
          `[react-native-logs] ERROR: You cannot disable a logger from extended logger`
        );
      };
      extendedLog["getExtensions"] = () => {
        throw Error(
          `[react-native-logs] ERROR: You cannot get extensions from extended logger`
        );
      };
      extendedLog["setSeverity"] = (level: string) => {
        throw Error(
          `[react-native-logs] ERROR: You cannot set severity from extended logger`
        );
      };
      extendedLog["getSeverity"] = () => {
        throw Error(
          `[react-native-logs] ERROR: You cannot get severity from extended logger`
        );
      };
      extendedLog["patchConsole"] = () => {
        throw Error(
          `[react-native-logs] ERROR: You cannot patch console from extended logger`
        );
      };
      extendedLog["getOriginalConsole"] = () => {
        throw Error(
          `[react-native-logs] ERROR: You cannot get original console from extended logger`
        );
      };
    });
    return extendedLog;
  };

  /** Enable logger or extension */
  enable = (extension?: string): boolean => {
    if (!extension) {
      this._enabled = true;
      return true;
    }

    if (this._extensions.includes(extension)) {
      if (this._enabledExtensions) {
        if (!this._enabledExtensions.includes(extension)) {
          this._enabledExtensions.push(extension);
          return true;
        } else {
          return true;
        }
      } else {
        this._enabledExtensions = [];
        this._enabledExtensions.push(extension);
        return true;
      }
    } else {
      throw Error(
        `[react-native-logs:enable] ERROR: Extension [${extension}] not exist`
      );
    }
  };

  /** Disable logger or extension */
  disable = (extension?: string): boolean => {
    if (!extension) {
      this._enabled = false;
      return true;
    }
    if (this._extensions.includes(extension)) {
      if (this._enabledExtensions) {
        let extIndex = this._enabledExtensions.indexOf(extension);
        if (extIndex > -1) {
          this._enabledExtensions.splice(extIndex, 1);
        }
        return true;
      } else {
        return true;
      }
    } else {
      throw Error(
        `[react-native-logs:disable] ERROR: Extension [${extension}] not exist`
      );
    }
  };

  /** Return all created extensions */
  getExtensions = (): string[] => {
    return this._extensions;
  };

  /** Set log severity API */
  setSeverity = (level: string): string => {
    if (level in this._levels) {
      this._level = level;
    } else {
      throw Error(
        `[react-native-logs:setSeverity] ERROR: Level [${level}] not exist`
      );
    }
    return this._level;
  };

  /** Get current log severity API */
  getSeverity = (): string => {
    return this._level;
  };

  /** Monkey Patch global console.log */
  patchConsole = (): void => {
    let extension = "console";
    let levelKeys = Object.keys(this._levels);

    if (!this._originalConsole) {
      this._originalConsole = console;
    }

    if (!this._transportOptions.consoleFunc) {
      this._transportOptions.consoleFunc = this._originalConsole.log;
    }

    console["log"] = (...msgs: any) => {
      this._log(levelKeys[0], extension, ...msgs);
    };

    levelKeys.forEach((level: string) => {
      if ((console as any)[level]) {
        (console as any)[level] = (...msgs: any) => {
          this._log(level, extension, ...msgs);
        };
      } else {
        this._originalConsole &&
          this._originalConsole.log(
            `[react-native-logs:patchConsole] WARNING: "${level}" method does not exist in console and will not be available`
          );
      }
    });
  };
}

type defLvlType = "debug" | "info" | "warn" | "error";

/**
 * Create a logger object. All params will take default values if not passed.
 * each levels has its level severity so we can filter logs with < and > operators
 * all subsequent levels to the one selected will be exposed (ordered by severity asc)
 * through the transport
 */
const createLogger = <Y extends string>(config?: configLoggerType) => {
  type levelMethods<levels extends string> = {
    [key in levels]: (...args: unknown[]) => void;
  };

  type loggerType = levelMethods<Y>;

  type extendMethods = {
    extend: (extension: string) => loggerType;
  };

  const mergedConfig = { ...defaultLogger, ...config };

  return new logs(mergedConfig) as unknown as Omit<logs, "extend"> &
    loggerType &
    extendMethods;
};

const logger = { createLogger };

export {
  logger,
  consoleTransport,
  mapConsoleTransport,
  fileAsyncTransport,
  sentryTransport,
};

export type { transportFunctionType, configLoggerType, defLvlType };
