'use strict'
const cote = require('cote')({statusLogsEnabled:false})
const fs = require('fs')
const path = require('path')
const u = require('elife-utils')
const luminate = require('@tpp/luminate')

const pwc = require('./pwc')

const EVER_ISSUER = process.env.EVER_ISSUER || 'GBKSIXNHYREDENMXFNL5XXIYG6UVBEJIKINYWYGTUR46MPZMGQKOM522'
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
                else {
                    loadMetaData(cfg)
                    startMicroservice(cfg, acc)
                    registerWithCommMgr()
                }
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
                            wallet_dir: path.join(u.dataLoc(), 'stellar'),
                            horizon: 'test', // TODO: Enable 'live' stellar network integration
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
            else cb(null, acc)
        })
    }

    function create_wallet_1() {
        luminate.wallet.create(cfg.pw, cfg.wallet_dir, WALLET_NAME, (err, acc) => {
            if(err) cb(err)
            else cb(null, acc)
        })
    }
}

/* microservice key (identity of the microservice) */
let msKey = 'everlife-stellar-svc'

function startMicroservice(cfg, acc) {

    /*      understand/
     * The microservice (partitioned by key to prevent conflicting with
     * other services
     */
    const svc = new cote.Responder({
        name: 'Everlife Stellar Service',
        key: msKey,
    })

    svc.on('account-id', (req, cb) => {
        cb(null, acc.pub)
    })

    svc.on('balance', (req, cb) => {
        getAccountBalance(cfg, acc, cb)
    })

    svc.on('setup-ever-trustline', (req, cb) => {
        setupEVERTrustline(cfg, acc, cb)
    })

    svc.on('msg', (req, cb) => {
        handleStellarCommands(cfg, acc, req, cb)
    })

    svc.on('issuer-meta-data', getIssuerMetaData)
    svc.on('pay-ever', (req,cb) =>{
        payEver(cfg, acc, req, cb)

    })
}

function getAccountBalance(cfg, acc, cb) {
    luminate.stellar.status(cfg.horizon, acc, (err, ai) => {
        if(err) cb(err)
        else {
            let bal = {xlm:0,ever:0}
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

function setupEVERTrustline(cfg, acc, cb) {
    luminate.stellar.setTrustline(
        cfg.horizon,
        acc,
        'EVER',
        EVER_ISSUER,
        null,
        cb
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
        fn(cfg, acc, req)
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
    setupEVERTrustline(cfg, acc, (err) => {
        if(err) {
            u.showErr(err)
            sendReply(`Error setting EVER trustline`, req)
        } else {
            sendReply(`Congratulations! EVER trustline set!`, req)
        }
    })
}


const commMgrClient = new cote.Requester({
    name: 'Calculator -> CommMgr',
    key: 'everlife-communication-svc',
})

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
let issuerMetaData;

function loadMetaData(cfg){
    luminate.stellar.status(cfg.horizon, { pub: EVER_ISSUER }, (err, data) => {
        if(err) console.log(err)
        else{
            issuerMetaData = data.data_attr
        }
    })
}

function getIssuerMetaData(req,cb){
    cb(null, issuerMetaData)
}

function payEver(cfg, acc, req, cb){
    luminate.stellar.pay(cfg.horizon, acc, 'EVER', req.amt, { pub: EVER_ISSUER }, null, (err) =>{
        cb(err)
    })
}

