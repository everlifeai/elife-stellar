'use strict'
const path = require('path')
const fs = require('fs')
const luminate = require('@tpp/luminate')
const u = require('elife-utils')

/*      problem/
 * The node has a stellar account that it uses to earn. This account is
 * managed by a wallet (`luminate`) and is password protected. How
 * should we get this password? If we ask the user each time we will not
 * be able to auto-start the node when it re-starts.
 *
 *      way/
 * For now, we will store the password in an encrypted file
 * (`.luminate-pw`). This is _not_ a good level of protection but it is
 * meant to be a temporary stopgap measure until we integrate with more
 * standard solutions like the Mac Keychain or similar solutions.
 * TODO: Find a better way to manage password
 */
module.exports = {
    savePw: savePw,
    loadPw: loadPw,
}

let PASSWORD_FILE = path.join(u.dataLoc(), '.luminate-pw')
let PASSWORD_ENC = "n9824bdS#MD"

/*      outcome/
 * Encrypt the given password and save it (along with it's nonce) as a
 * javascript object.
 */
function savePw(pw, cb) {
    if(!pw || !pw.trim()) cb(`No password provided`)
    else {
        let salt = luminate.crypt.createSalt()
        let nonce = luminate.crypt.createNonce()

        luminate.crypt.password2key(salt, PASSWORD_ENC, (err, key) => {
            if(err) cb(err)
            else {
                let enc = luminate.crypt.encrypt(pw, nonce, key)
                let s = {
                    salt: salt,
                    nonce: nonce,
                    pw: enc,
                }
                fs.writeFile(PASSWORD_FILE, JSON.stringify(s,null,2), 'utf-8', cb)
            }
        })
    }
}

/*      outcome/
 * Load the password from the password file, decrypt and return it.
 */
function loadPw(cb) {
    fs.readFile(PASSWORD_FILE, 'utf8', (err, data) => {
        if(err) cb(err)
        else {
            try {
                let s = JSON.parse(data)
                luminate.crypt.password2key(s.salt, PASSWORD_ENC, (err, key) => {
                    if(err) cb(err)
                    else {
                        let pw = luminate.crypt.decrypt(s.pw, s.nonce, key)
                        cb(null, pw)
                    }
                })
            } catch(e) {
                cb(e)
            }
        }
    })
}
