'use strict'

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
    PASSWORD_FILE: "/data/.luminate-pw",
    PASSWORD_ENC: "n9824bdS#MD",
}
