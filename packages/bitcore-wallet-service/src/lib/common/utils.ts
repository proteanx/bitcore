import _ from 'lodash';

const $ = require('preconditions').singleton();
const bitcore = require('bitcore-lib');
const crypto = bitcore.crypto;
const secp256k1 = require('secp256k1');
const Bitcore = require('bitcore-lib');
const Bitcore_ = {
  btc: Bitcore,
  dvt: require('bitcore-lib-dvt')
};

export class Utils {
  static getMissingFields(obj, args) {
    args = [].concat(args);
    if (!_.isObject(obj)) return args;
    const missing = _.filter(args, (arg) => {
      return !obj.hasOwnProperty(arg);
    });
    return missing;
  }

  /**
   *
   * @desc rounds a JAvascript number
   * @param number
   * @return {number}
   */
  static strip(number) {
    return parseFloat(number.toPrecision(12));
  }

  /* TODO: It would be nice to be compatible with bitcoind signmessage. How
   * the hash is calculated there? */
  static hashMessage(text, noReverse) {
    $.checkArgument(text);
    const buf = new Buffer(text);
    let ret = crypto.Hash.sha256sha256(buf);
    if (!noReverse) {
      ret = new bitcore.encoding.BufferReader(ret).readReverse();
    }
    return ret;
  }

  static verifyMessage(text, signature, publicKey) {
    $.checkArgument(text);

    const hash = Utils.hashMessage(text, true);

    const sig = this._tryImportSignature(signature);
    if (!sig) {
      return false;
    }

    const publicKeyBuffer = this._tryImportPublicKey(publicKey);
    if (!publicKeyBuffer) {
      return false;
    }

    return this._tryVerifyMessage(hash, sig, publicKeyBuffer);
  }

  static _tryImportPublicKey(publicKey) {
    let publicKeyBuffer = publicKey;
    try {
      if (!Buffer.isBuffer(publicKey)) {
        publicKeyBuffer = new Buffer(publicKey, 'hex');
      }
      return publicKeyBuffer;
    } catch (e) {
      return false;
    }
  }

  static _tryImportSignature(signature) {
    try {
      let signatureBuffer = signature;
      if (!Buffer.isBuffer(signature)) {
        signatureBuffer = new Buffer(signature, 'hex');
      }
      return secp256k1.signatureImport(signatureBuffer);
    } catch (e) {
      return false;
    }
  }

  static _tryVerifyMessage(hash, sig, publicKeyBuffer) {
    try {
      return secp256k1.verify(hash, sig, publicKeyBuffer);
    } catch (e) {
      return false;
    }
  }

  static formatAmount(satoshis, unit, opts) {
    const UNITS = {
      btc: {
        toSatoshis: 100000000,
        maxDecimals: 6,
        minDecimals: 2
      },
      bit: {
        toSatoshis: 100,
        maxDecimals: 0,
        minDecimals: 0
      },
      sat: {
        toSatoshis: 1,
        maxDecimals: 0,
        minDecimals: 0
      },
      dvt: {
        toSatoshis: 100000000,
        maxDecimals: 6,
        minDecimals: 2
      }
    };

    $.shouldBeNumber(satoshis);
    $.checkArgument(_.includes(_.keys(UNITS), unit));

    function addSeparators(nStr, thousands, decimal, minDecimals) {
      nStr = nStr.replace('.', decimal);
      const x = nStr.split(decimal);
      let x0 = x[0];
      let x1 = x[1];

      x1 = _.dropRightWhile(x1, (n, i) => {
        return n == '0' && i >= minDecimals;
      }).join('');
      const x2 = x.length > 1 ? decimal + x1 : '';

      x0 = x0.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return x0 + x2;
    }

    opts = opts || {};

    const u = _.assign(UNITS[unit], opts);
    const amount = (satoshis / u.toSatoshis).toFixed(u.maxDecimals);
    return addSeparators(
      amount,
      opts.thousandsSeparator || ',',
      opts.decimalSeparator || '.',
      u.minDecimals
    );
  }

  static formatAmountInBtc(amount) {
    return (
      Utils.formatAmount(amount, 'btc', {
        minDecimals: 8,
        maxDecimals: 8
      }) + 'btc'
    );
  }

  static formatUtxos(utxos) {
    if (_.isEmpty(utxos)) return 'none';
    return _.map([].concat(utxos), (i) => {
      const amount = Utils.formatAmountInBtc(i.satoshis);
      const confirmations = i.confirmations ? i.confirmations + 'c' : 'u';
      return amount + '/' + confirmations;
    }).join(', ');
  }

  static formatRatio(ratio) {
    return (ratio * 100).toFixed(4) + '%';
  }

  static formatSize(size) {
    return (size / 1000).toFixed(4) + 'kB';
  }

  static parseVersion(version) {
    const v: {
      agent?: string;
      major?: number;
      minor?: number;
      patch?: number;
    } = {};

    if (!version) return null;

    let x = version.split('-');
    if (x.length != 2) {
      v.agent = version;
      return v;
    }
    v.agent = _.includes(['bwc', 'bws'], x[0]) ? 'bwc' : x[0];
    x = x[1].split('.');
    v.major = x[0] ? parseInt(x[0]) : null;
    v.minor = x[1] ? parseInt(x[1]) : null;
    v.patch = x[2] ? parseInt(x[2]) : null;

    return v;
  }

  static parseAppVersion(agent) {
    const v: {
      app?: string;
      major?: number;
      minor?: number;
      patch?: number;
    } = {};
    if (!agent) return null;
    agent = agent.toLowerCase();

    let w;
    w = agent.indexOf('copay');
    if (w >= 0) {
      v.app = 'copay';
    } else {
      w = agent.indexOf('bitpay');
      if (w >= 0) {
        v.app = 'bitpay';
      } else {
        v.app = 'other';
        return v;
      }
    }

    const version = agent.substr(w + v.app.length);
    const x = version.split('.');
    v.major = x[0] ? parseInt(x[0].replace(/\D/g, '')) : null;
    v.minor = x[1] ? parseInt(x[1]) : null;
    v.patch = x[2] ? parseInt(x[2]) : null;

    return v;
  }

  static checkValueInCollection(value, collection) {
    if (!value || !_.isString(value)) return false;
    return _.includes(_.values(collection), value);
  }

  static getAddressCoin(address) {
    try {
      new Bitcore_['btc'].Address(address);
      return 'btc';
    } catch (e) {
      try {
        new Bitcore_['dvt'].Address(address);
        return 'dvt';
      } catch (e) {
        return;
      }
    }
  }

  static translateAddress(address, coin) {
    const origCoin = Utils.getAddressCoin(address);
    const origAddress = new Bitcore_[origCoin].Address(address);
    const origObj = origAddress.toObject();

    const result = Bitcore_[coin].Address.fromObject(origObj);
    return coin == 'dvt' ? result.toLegacyAddress() : result.toString();
  }
}
module.exports = Utils;
