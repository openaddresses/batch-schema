import Err from '@openaddresses/batch-error';

/**
 * @class
 */
export default class Param {
    static integer(req, name) {
        req.params[name] = parseInt(req.params[name]);
        if (isNaN(req.params[name])) {
            throw new Err(400, null, `${name} param must be an integer`);
        }
    }

    static number(req, name) {
        req.params[name] = Number(req.params[name]);
        if (isNaN(req.params[name])) {
            throw new Err(400, null, `${name} param must be numeric`);
        }
    }

    static boolean(req, name) {
        if (!['true', 'false'].includes(req.params[name])) throw new Error(`${name} param must be a boolean`);
        req.params[name] = req.params[name] === true ? true : false;
    }

    static string(req, name) {
        req.params[name] = String(req.params[name]);
    }
}
