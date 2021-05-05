'use strict'
const fs = require('fs')
const path = require('path')

const StellarSdk = require('stellar-sdk')
const cote = require('cote')({statusLogsEnabled:false})

const u = require('@elife/utils')
const luminate = require('@tpp/luminate')

const pwc = require('./pwc')

const EVER_ISSUER = process.env.EVER_ISSUER || 'GDRCJ5OJTTIL4VUQZ52PCZYAUINEH2CUSP5NC2R6D6WQ47JBLG6DF5TE'

const ethers = require("ethers")

/*    understand/
 * Microservice key (identity of the microservice)
 */
let msKey = 'everlife-stellar-svc'

const commMgrClient = new cote.Requester({
    name: 'Stellar -> CommMgr',
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
    loadConfig(msinfo)

    loadWallet(msinfo, (err) => {
        if(err) u.showErr(err)
        startMicroservice(msinfo)
        registerWithCommMgr()
    })
}

function loadConfig(msinfo) {
    let horizon = process.env.ELIFE_STELLAR_HORIZON
    if(!horizon) horizon = 'live'

    /* NB: timeout is in seconds */
    let timeout = process.env.ELIFE_STELLAR_TIMEOUT
    if(!timeout) timeout = 30

    msinfo.cfg = {
        wallet_dir: path.join(u.dataLoc(), 'stellar'),
        horizon: horizon,
        timeout: timeout,
    }
}

/*    outcome/
 * load the wallet account from the secret file
 * or load it from the luminate wallet
 */
function loadWallet(msinfo, cb) {
    loadSecretWallet(msinfo, (err, ok) => {
        if(err) u.showErr(err)
        if(ok) done_1()
        else loadLuminateWallet(msinfo, done_1)
    })

    function done_1(err) {
        if(err) cb(err)
        else loadMetaData(msinfo.cfg, cb)
    }

}

function loadSecretWallet(msinfo, cb) {
    fs.readFile(u.secretFile(), 'utf8', (err, data) => {
      if(err) return cb(err)
      try {
        data = data.replace(/\s*#[^\n]*/g, "")
        data = JSON.parse(data)
        if(data.stellar && data.stellar.publicKey && data.stellar.secretKey) {
          msinfo.acc = {
            pub: data.stellar.publicKey,
            _kp: StellarSdk.Keypair.fromSecret(data.stellar.secretKey),
          }
          cb(null, true)
        } else {
          cb()
        }
      } catch(e) {
        cb(e)
      }
    })
}

function loadLuminateWallet(msinfo, cb) {
    loadPw(msinfo, (err) => {
        if(err) cb(err)
        else loadAccount(msinfo, err=>{
            if(err) cb(err)
            else{
                //Saving stellar keys and ethereum keys into secret file
                 var content = fs.readFileSync(u.secretFile(), 'utf8', (err, data) => {   
                })
                let keys=content.split('}')[0]
                let existingKeys="{"+keys.split('{')[1]+"}"
                existingKeys = JSON.parse(existingKeys);
                const eth = {
                    address: ewallet.address,
                    publicKey: ewallet.publicKey,
                    privateKey: ewallet.privateKey
                  }
                const stellar ={
                    publicKey: msinfo.acc.pub,
                    secretKey:msinfo.acc.secret
                }
                existingKeys.stellar =stellar
                existingKeys.eth =eth
                const lines = [
                    "# this is your SECRET name.",
                    "# this name gives you magical powers.",
                    "# with it you can mark your messages so that your friends can verify",
                    "# that they really did come from you.",
                    "#",
                    "# if any one learns this name, they can use it to destroy your identity",
                    "# NEVER show this to anyone!!!",
                    "",
                    JSON.stringify(existingKeys, null, 2),
                    "",
                    "# WARNING! It's vital that you DO NOT edit OR share your secret name",
                    "# instead, share your public name",
                    "# your public name: " + existingKeys.id,
                  ].join("\n")
                  fs.chmod(u.secretFile(), 0o600, err => {
                    if(err) {
                      console.log(err)
                      cb()
                    } else {
                      fs.writeFile(u.secretFile(), lines, err => {
                        if(err) {
                          console.log(err)
                          cb()
                        } else {
                          fs.chmod(u.secretFile(), 0x100, cb)
                        }
                      })
                    }
                  })
                 
              
             }

        })
    })
}
main()

/*      outcome/
 * Load the password from an encrypted file
 */
function loadPw(msinfo, cb) {
    GOT_USER_PW = false

    pwc.loadPw((err, pw) => {
        if(err) cb(err)
        else {
            if(!pw) cb(`Failed loading wallet password`)
            else {
                GOT_USER_PW = true
                msinfo.cfg.pw = pw
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

    svc.on('claimable-balance', (req, cb) => {
        createClaimableBalance(req, msinfo.cfg, msinfo.acc, cb)
    })
}

function importNewWallet(msinfo, req, cb) {
    if(!req.secret) return cb('No secret seed found to import!')
    let content
    try {
        content = fs.readFileSync(u.secretFile(), 'utf8')
        content = content.replace(/\s*#[^\n]*/g, "")
    } catch(err) {
        return cb(err)
    }
    let oldStellarArr=[];
    let stellarSecretKey=req.secret;
    let sourceKeypair=StellarSdk.Keypair.fromSecret(req.secret);
    let stellarPublicKey=sourceKeypair.publicKey()
    let stringtoJSON = JSON.parse(content)
    let stellarKeys = stringtoJSON.stellar
    if(stellarKeys.hasOwnProperty('old')){
        oldStellarArr.push(...stellarKeys.old)
        oldStellarArr.unshift({
            publicKey:stellarKeys.publicKey,
            secretKey:stellarKeys.secretKey
        })
    }else{
        oldStellarArr.push(stellarKeys)
    }
    let newStellarKeys={
        publicKey:stellarPublicKey, 
        secretKey:stellarSecretKey,
        old:oldStellarArr
    }
    stringtoJSON.stellar= newStellarKeys
    let allKeys=stringtoJSON
    const lines = [
        "# this is your SECRET name.",
        "# this name gives you magical powers.",
        "# with it you can mark your messages so that your friends can verify",
        "# that they really did come from you.",
        "#",
        "# if any one learns this name, they can use it to destroy your identity",
        "# NEVER show this to anyone!!!",
        "",
        JSON.stringify(allKeys, null, 2),
        "",
        "# WARNING! It's vital that you DO NOT edit OR share your secret name",
        "# instead, share your public name",
        "# your public name: " + stringtoJSON.id,
    ].join("\n")
    fs.chmod(u.secretFile(), 0o600, err => {
        if(err) {
            console.log(err)
            cb()
        } else {
            fs.writeFile(u.secretFile(), lines, err => {
                if(err) {
                    console.log(err)
                    cb()
                } else {
                    fs.chmod(u.secretFile(), 0x100, cb)
                }
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
        cfg.timeout,
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

    luminate.stellar.pay(
        cfg.timeout,
        cfg.horizon,
        acc,
        'EVER', req.amt,
        { pub: EVER_ISSUER },
        null, (err) =>{
            cb(err)
        })
}

async function createClaimableBalance(req, cfg, acc,  cb) {
    const server =  getStellarServer(cfg.horizon)

    const me = acc._kp

    const recp = req.recp
    if(!recp) return cb('No recp(ient) present in request')

    const amount = req.amount
    if(!amount) return cb('No amount present in request')

    const account = await server.loadAccount(me.publicKey()).catch(err => {
        u.showErr(`Failed to load ${me.publicKey()}: ${err}`)
        return cb(`Failed to load ${me.publicKey()}: ${err}`)
    })

    const soon = Math.ceil((Date.now() / 1000) + 600)
    const canClaim = StellarSdk.Claimant.predicateBeforeRelativeTime("600")
    const canReclaim = StellarSdk.Claimant.predicateNot(StellarSdk.Claimant.predicateBeforeAbsoluteTime(soon.toString()))

    const claimableBalanceEntry =  StellarSdk.Operation.createClaimableBalance({
        claimants: [
            new StellarSdk.Claimant(recp, canClaim),
            new StellarSdk.Claimant(me.publicKey(), canReclaim)
        ],
        asset: StellarSdk.Asset.native(),
        amount,
    });

    const tx = new StellarSdk.TransactionBuilder(account, {fee: StellarSdk.BASE_FEE})
        .addOperation(claimableBalanceEntry)
        .setNetworkPassphrase(getNetworkPhrase(cfg.horizon))
        .setTimeout(180)
        .build()

    tx.sign(me)

    try {
        const txResponse = await server.submitTransaction(tx)
        const txResult = StellarSdk.xdr.TransactionResult.fromXDR(txResponse.result_xdr, "base64")
        const results = txResult.result().results()
        const result = results[0].value().createClaimableBalanceResult()
        const claim = result.balanceId().toXDR("hex")

        cb(null, claim)

    } catch(e) {
        u.showErr(e)
        cb(e)
    }
}

const LIVE_HORIZON = "https://horizon.stellar.org/"
const TEST_HORIZON = "https://horizon-testnet.stellar.org/"

function getNetworkPhrase(horizon) {
    if(horizon == 'live') {
        return StellarSdk.Networks.PUBLIC
    } else {
        return StellarSdk.Networks.TESTNET
    }
}

function getStellarServer(horizon) {
    if(horizon == 'live') {
        return new StellarSdk.Server(LIVE_HORIZON)
    } else {
        return new StellarSdk.Server(TEST_HORIZON)
    }
}
