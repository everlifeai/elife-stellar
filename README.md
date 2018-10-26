# Everlife Stellar Service

![stellar](elife-stellar.png)

**_Your Everlife Wallet_**

Every Everlife avatar has a wallet on the Stellar chain. This module
manages that wallet.

## Setup
In order to safeguard the wallet, it is password protected. So that the
user does not need to type in this password again and again it needs to
be saved once. In order to do this you need to do the following:

1. Load the node

        $> ./run.sh enter

2. Go to the Stellar Server

        # cd services/elife-stellar

3. Run the password manager

        # node pw

4. Exit and start the avatar

        # exit

        $> ./run.sh avatar

When prompted for the password, pick a good password that you are
comfortable with. PLEASE REMEMBER THIS PASSWORD AS IT **CANNOT BE
RECOVERED**.
