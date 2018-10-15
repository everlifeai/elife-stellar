'use strict'
const cote = require('cote')({statusLogsEnabled:false})
const fs = require('fs')
const path = require('path')
const u = require('elife-utils')
const luminate = require('luminate')

const pwc = require('./pwc')

/*      understand/
 * This is the main entry point where we start.
 *
 *      outcome/
 * Load configuration and start the microservice
 */
function main() {
    loadConfig((err, cfg) => {
        if(err) u.showErr(err)
        else {
            loadAccount(cfg, (err, acc) => {
                if(err) u.showErr(err)
                else startMicroservice(cfg, acc)
            })
        }
    })
}
main()

/*      outcome/
 * Load the password from an encrypted file
 */
function loadConfig(cb) {
    fs.readFile(pwc.PASSWORD_FILE, 'utf8', (err, data) => {
        if(err) cb(err)
        else {
            try {
                let s = JSON.parse(data)
                luminate.crypt.password2key(s.salt, pwc.PASSWORD_ENC, (err, key) => {
                    if(err) cb(err)
                    else {
                        let pw = luminate.crypt.decrypt(s.pw, s.nonce, key)
                        let cfg = {
                            pw: pw,
                            wallet_dir: path.join(__dirname, 'stellar'),
                        }
                        cb(null, cfg)
                    }
                })
            } catch(e) {
                cb(e)
            }
        }
    })
}

/*      outcome/
 * Look for the wallet account and load it if found. Otherwise create a
 * new wallet account for this avatar.
 */
function loadAccount(cfg, cb) {
    const WALLET_NAME = 'wallet'

    luminate.wallet.list(cfg.wallet_dir, (err, accs, errs) => {
        if(err) cb(err)
        else {
            if(errs && errs.length) u.showErr(errs) // only display problems in wallet dir
                                    //  don't do anything else

            let found = false
            for(let i = 0;i < accs.length;i++) {
                if(accs[i].name == WALLET_NAME) found = true
            }

            if(found) load_wallet_1()
            else create_wallet_1()
        }
    })

    function load_wallet_1() {
        luminate.wallet.load(cfg.pw, cfg.wallet_dir, WALLET_NAME, (err, acc) => {
            if(err) cb(err)
            else cb(null, acc.pub)
        })
    }

    function create_wallet_1() {
        luminate.wallet.create(cfg.pw, cfg.wallet_dir, WALLET_NAME, (err, acc) => {
            if(err) cb(err)
            else cb(null, acc)
        })
    }
}

function startMicroservice(cfg, acc) {

    /*      understand/
     * The microservice (partitioned by key to prevent conflicting with
     * other services
     */
    const svc = new cote.Responder({
        name: 'Everlife Stellar Service',
        key: 'everlife-stellar-svc',
    })

    svc.on('account-id', (req, cb) => {
        cb(null, acc)
    })
}
