import { transportFunctionType } from '../index';

/** Web Console color string constants */
const clientColors: Array<string> = [
  '',
  'color: dodgerblue;font-weight:bold',
  'color: orange;font-weight:bold;',
  'color: indianred;font-weight:bold;',
];

const log: transportFunctionType = (msg, level, options) => {
  /**
   * Control msg type
   * Here we use JSON.stringify so you can pass object, array, string, ecc...
   */
  let stringMsg: string;
  if (typeof msg === 'string') {
    stringMsg = msg;
  } else if (typeof msg === 'function') {
    stringMsg = '[function]';
  } else {
    stringMsg = JSON.stringify(msg);
  }

  let dateTxt;
  if (options && options.dateFormat === 'utc') {
    dateTxt = `${new Date().toUTCString()} | `;
  } else if (options && options.dateFormat === 'iso') {
    dateTxt = `${new Date().toISOString()} | `;
  } else {
    dateTxt = `${new Date().toLocaleString()} | `;
  }

  let levelTxt = `${level.text.toUpperCase()} | `;

  if (options && options.hideDate) dateTxt = '';
  if (options && options.hideLevel) levelTxt = '';

  let output = `%c${dateTxt}${levelTxt}${stringMsg}`;
  console.log(output, clientColors[level.severity] || '');
};

const colorConsoleAsync: transportFunctionType = (msg, level, options) => {
  setTimeout(function() {
    log(msg, level, options);
  }, 0);
  return true;
};

export { colorConsoleAsync };