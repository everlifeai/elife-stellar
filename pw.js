'use strict'
const read = require('read')
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
    pwc.loadPw((err, pw) => {
        if(pw) console.log(`Password file already exists`)
        else {
            getUserPw((err,pw) => {
                if(err) console.error(err)
                else pwc.savePw(pw, (err) => {
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
    }, (err, pw) => {
        if(err) cb(err)
        else read({
            prompt: "Confirm Password:",
            silent: true,
        }, (err, pw2) => {
            if(err) cb(err)
            else {
                if(pw != pw2) cb('Passwords do not match!')
                else return cb(null, pw)
            }
        })
    })
}

