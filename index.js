'use strict'
const cote = require('cote')({statusLogsEnabled:false})
const fs = require('fs')
const path = require('path')
const u = require('elife-utils')
const luminate = require('@tpp/luminate')

const pwc = require('./pwc')

const EVER_ISSUER = process.env.EVER_ISSUER || 'GDRCJ5OJTTIL4VUQZ52PCZYAUINEH2CUSP5NC2R6D6WQ47JBLG6DF5TE'

/*    understand/
 * Microservice key (identity of the microservice)
 */
let msKey = 'everlife-stellar-svc'

const commMgrClient = new cote.Requester({
    name: 'Calculator -> CommMgr',
    key: 'everlife-communication-svc',
})


/*    understand/
 * Keep track if we have been able to get the user password or not
 */
let GOT_USER_PW = false


/*      understand/
 * This is the main entry point where we start.
 *
 *      outcome/
 * Start the microservice and load the stellar wallet
 */
function main() {
    let msinfo = {
        cfg: null,
        acc: null,
    }
    loadWallet(msinfo, (err) => {
        if(err) u.showErr(err)
        startMicroservice(msinfo)
        registerWithCommMgr()
    })
}

function loadWallet(msinfo, cb) {
    loadConfig(msinfo, (err) => {
        if(err) cb(err)
        else {
            loadAccount(msinfo, (err) => {
                if(err) cb(err)
                else {
                    loadMetaData(msinfo.cfg, cb)
                }
            })
        }
    })
}
main()

/*      outcome/
 * Load the password from an encrypted file
 */
function loadConfig(msinfo, cb) {
    let horizon = process.env.ELIFE_STELLAR_HORIZON
    if(!horizon) horizon = 'live'

    GOT_USER_PW = false

    pwc.loadPw((err, pw) => {
        if(err) cb(err)
        else {
            if(!pw) cb(`Failed loading wallet password`)
            else {
                GOT_USER_PW = true
                msinfo.cfg = {
                    pw: pw,
                    wallet_dir: path.join(u.dataLoc(), 'stellar'),
                    horizon: horizon,
                }
                cb()
            }
        }
    })
}

const WALLET_PFX = 'wallet'

/*      outcome/
 * Look for the wallet account and load it if found. Otherwise create a
 * new wallet account for this avatar.
 */
function loadAccount(msinfo, cb) {
    luminate.wallet.list(msinfo.cfg.wallet_dir, (err, accs, errs) => {
        if(err) cb(err)
        else {
            if(errs && errs.length) u.showErr(errs) // only display problems in wallet dir
                                    //  don't do anything else

            let found
            for(let i = 0;i < accs.length;i++) {
                if(accs[i].name.startsWith(WALLET_PFX)) {
                    if(!found || found < accs[i].name) found = accs[i].name
                }
            }

            if(found) load_wallet_1(found)
            else create_wallet_1()
        }
    })

    function load_wallet_1(wallet_name) {
        luminate.wallet.load(msinfo.cfg.pw, msinfo.cfg.wallet_dir, wallet_name, (err, acc) => {
            if(err) cb(err)
            else {
                msinfo.acc = acc
                cb(null)
            }
        })
    }

    function create_wallet_1() {
        luminate.wallet.create(msinfo.cfg.pw, msinfo.cfg.wallet_dir, WALLET_PFX, (err, acc) => {
            if(err) cb(err)
            else {
                msinfo.acc = acc
                cb(null)
            }
        })
    }
}

function startMicroservice(msinfo) {

    /*      understand/
     * The microservice (partitioned by key to prevent conflicting with
     * other services
     */
    const svc = new cote.Responder({
        name: 'Everlife Stellar Service',
        key: msKey,
    })

    svc.on('set-new-pw', (req, cb) => {
        setNewPw(msinfo, req, cb)
    })

    svc.on('account-id', (req, cb) => {
        getAccountId(msinfo.acc, cb)
    })

    svc.on('balance', (req, cb) => {
        getAccountBalance(msinfo.cfg, msinfo.acc, cb)
    })

    svc.on('txns', (req, cb) => {
        getAccountTransactions(msinfo.cfg, msinfo.acc, cb)
    })

    svc.on('setup-ever-trustline', (req, cb) => {
        setupEVERTrustline(msinfo.cfg, msinfo.acc, cb)
    })

    svc.on('msg', (req, cb) => {
        handleStellarCommands(msinfo.cfg, msinfo.acc, req, cb)
    })

    svc.on('import-new-wallet', (req, cb) => {
        importNewWallet(msinfo, req, cb)
    })

    svc.on('issuer-meta-data', getIssuerMetaData)
    svc.on('pay-ever', (req, cb) =>{
        payEver(msinfo.cfg, msinfo.acc, req, cb)
    })
}

function importNewWallet(msinfo, req, cb) {
    if(!req.secret) return cb('No secret seed found to import!')
    luminate.wallet.list(msinfo.cfg.wallet_dir, (err, accs, errs) => {
        if(err) cb(err)
        else {
            if(errs && errs.length) u.showErr(errs) // only display problems in wallet dir
                                    //  don't do anything else
            let ndx = 0
            for(let i = 0;i < accs.length;i++) {
                if(accs[i].name.startsWith(WALLET_PFX)) {
                    let num = accs[i].name.substring(WALLET_PFX.length)
                    num = parseInt(num)
                    if(isNaN(num)) num = 0
                    if(num > ndx) ndx = num
                }
            }
            ndx += 1
            ndx = "00000" + ndx
            ndx = ndx.substr(-3)
            luminate.wallet.importSecret(msinfo.cfg.pw, msinfo.cfg.wallet_dir, WALLET_PFX + ndx, req.secret, (err) => {
                if(err) cb(err)
                else loadWallet(msinfo, cb)
            })
        }
    })
}

function setNewPw(msinfo, req, cb) {
    pwc.savePw(req.pw, (err) => {
        if(err) cb(err)
        else loadWallet(msinfo, cb)
    })
}

function getAccountId(acc, cb) {
    if(!acc) return cb({ error: 'Wallet not loaded!', nopw: !GOT_USER_PW })
    cb(null, acc.pub)
}

function getAccountBalance(cfg, acc, cb) {
    if(!cfg || !acc) return cb({ error: 'Wallet not loaded!', nopw: !GOT_USER_PW })
    luminate.stellar.status(cfg.horizon, acc, (err, ai) => {
        if(err) cb(err)
        else {
            let bal = {xlm:null,ever:null}
            if(!ai.balances || !ai.balances.length) return cb(null, bal)
            for(let i = 0;i < ai.balances.length;i++) {
                let b = ai.balances[i]
                if(b.asset_type == 'native') bal.xlm = b.balance
                if(b.asset_code == 'EVER'
                    && b.asset_issuer == EVER_ISSUER) bal.ever = b.balance

            }
            cb(null, bal)
        }
    })
}

function getAccountTransactions(cfg, acc, cb) {
    if(!cfg || !acc) return cb({ error: 'Wallet not loaded!', nopw: !GOT_USER_PW })
    let r = []

    luminate.stellar.accountTransactions(cfg.horizon, acc, (err, txns) => {
        if(err) {
            cb(err)
        } else {
            r = r.concat(txns)
            if(txns.length) return true
            else cb(null, r)
        }
    })
}

function setupEVERTrustline(cfg, acc, cb) {
    if(!cfg || !acc) return cb({ error: 'Wallet not loaded!', nopw: !GOT_USER_PW })
    luminate.stellar.setTrustline(
        cfg.horizon,
        acc,
        'EVER',
        EVER_ISSUER,
        null,
        (err) => {
            if(err) {
                if(err.response && err.response.data) {
                    let errmsg = JSON.stringify(err.response.data)
                    u.showErr(errmsg)
                    cb(errmsg)
                } else cb(err)
            } else cb()
        }
    )
}

/*      outcome/
 * Check if we can handle the commands that the user has given otherwise
 * let the control pass on.
 */
function handleStellarCommands(cfg, acc, req, cb) {
    let d = {
        '/wallet_save_keys': saveAccountKeys,
        '/wallet_set_trustline': walletSetTrustline,
    }

    let fn = d[req.msg]
    if(!fn) return cb()
    else {
        cb(null, true)
        if(!cfg || !acc) sendReply('Wallet not loaded!')
        else fn(cfg, acc, req)
    }
}

/*      problem/
 * The stellar account keys are stored securely in our avatar's luminate
 * wallet. However, the owner may want direct access to the wallet
 * because we haven't provided some functionality or for some other
 * reason.
 *
 *      way/
 * We will dump the wallet key pair into a plain-text/JSON-ish file on
 * disk like this:
 *
 * # This is your Stellar Wallet SECRET
 * # Anyone with this information can control your wallet.
 * #
 * # Do not share this with anyone!!!
 *
 * {
 *    "public": "GDRCJ5OJTTIL4VUQZ52PCZYAUINEH2CUSP5NC2R6D6WQ47JBLG6DF5TE",
 *    "secret": "SBETEA3Z3OYHLSKKZWBVXQSX7NKTWCEQMUWOEITXMQVBKUOR5ZMCIE3I"
 * }
 */
function saveAccountKeys(cfg, acc, req) {
    if(!cfg || !acc) return sendReply('Wallet not loaded!')
    let s = secret_file_name_1()
    fs.writeFile(s, `# This is your Stellar Wallet SECRET
# Anyone with this information can control your wallet.
#
# Do not share this with anyone!!!

{
    "public": "${acc._kp.publicKey()}",
    "secret": "${acc._kp.secret()}"
}
`, (err) => {
    if(err) {
        u.showErr(err)
        sendReply(`Failed writing file`, req)
    } else {
        sendReply(`Exported your wallet to: "${s}"`, req)
    }
})

    function secret_file_name_1() {
        return path.join(u.dataLoc(), 'stellar-wallet-export')
    }
}

function walletSetTrustline(cfg, acc, req) {
    if(!cfg || !acc) return sendReply('Wallet not loaded!')
    setupEVERTrustline(cfg, acc, (err) => {
        if(err) {
            u.showErr(err)
            sendReply(`Error setting EVER trustline`, req)
        } else {
            sendReply(`Congratulations! EVER trustline set!`, req)
        }
    })
}


function sendReply(msg, req) {
    req.type = 'reply'
    req.msg = String(msg)
    commMgrClient.send(req, (err) => {
        if(err) u.showErr(err)
    })
}

/*      outcome/
 * Register ourselves as a message handler with the communication
 * manager so we can handle requests
 */
function registerWithCommMgr() {
    commMgrClient.send({
        type: 'register-msg-handler',
        mskey: msKey,
        mstype: 'msg',
        mshelp: [
            { cmd: '/wallet_set_trustline', txt: 'setup EVER trustline' },
            { cmd: '/wallet_save_keys', txt: 'save/export wallet keys' },
        ],
    }, (err) => {
        if(err) u.showErr(err)
    })
}
let ISSUERMETADATA;

function loadMetaData(cfg, cb){
    if(ISSUERMETADATA) return cb()
    luminate.stellar.status(cfg.horizon, { pub: EVER_ISSUER }, (err, data) => {
        if(err) cb(err)
        else {
            ISSUERMETADATA = data.data_attr
            cb()
        }
    })
}

function getIssuerMetaData(req,cb){
    cb(null, ISSUERMETADATA)
}

function payEver(cfg, acc, req, cb){
    if(!cfg || !acc) return cb({ error: 'Wallet not loaded!', nopw: !GOT_USER_PW })
    luminate.stellar.pay(cfg.horizon, acc, 'EVER', req.amt, { pub: EVER_ISSUER }, null, (err) =>{
        cb(err)
    })
}

