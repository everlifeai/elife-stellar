'use strict'
const read = require('read')
const luminate = require('@tpp/luminate')
const fs = require('fs')

const pwc = require('./pwc')

/*      understand/
 * This is the main entry point of our program
 *
 *      outcome/
 * If we do not have a password, ask the user for one, encrypt and save
 * it to the password file.
 */
function main() {
    fs.access(pwc.PASSWORD_FILE, fs.constants.F_OK, (err) => {
        if(!err) console.log(`Password file already exists`)
        else {
            getUserPw((err,pw) => {
                if(err) u.showErr(err)
                else savePw(pw, pwc.PASSWORD_FILE, (err) => {
                    if(err) console.error(err)
                    else console.log(`Password saved`)
                })
            })
        }
    })
}
main()

function getUserPw(cb) {
    read({
        prompt: "Password:",
        silent: true,
    }, cb)
}

/*      outcome/
 * Encrypt the given password and save it (along with it's nonce) as a
 * javascript object.
 */
function savePw(pw, f, cb) {
    if(!pw || !pw.trim()) console.error(`No password provided`)
    else {
        let salt = luminate.crypt.createSalt()
        let nonce = luminate.crypt.createNonce()

        luminate.crypt.password2key(salt, pwc.PASSWORD_ENC, (err, key) => {
            if(err) cb(err)
            else {
                let enc = luminate.crypt.encrypt(pw, nonce, key)
                let s = {
                    salt: salt,
                    nonce: nonce,
                    pw: enc,
                }
                fs.writeFile(f, JSON.stringify(s,null,2), 'utf-8', cb)
            }
        })
    }
}
