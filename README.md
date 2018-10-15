# Everlife Stellar Service

![stellar](elife-stellar.png)

**_Your Everlife Wallet_**

Every Everlife avatar has a wallet on the Stellar chain. This module
manages that wallet.

## Setup
In order to safeguard the wallet, it is password protected. So that the
user does not need to type in this password again and again it needs to
be saved once. In order to do this you need to do the following:

1. Start the node

        ./run.sh avatar

2. Enter the node

        ./run.sh enter

3. Go to the Stellar Server

        cd services/elife-stellar

4. Run the password manager

        node pw


When prompted for the password, pick a good password that you are
comfortable with. PLEASE REMEMBER THIS PASSWORD AS IT **CANNOT BE
RECOVERED**.
