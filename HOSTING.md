# Hosting your own copy on Cloudflare (for iPhone)

This puts the Shiftwise website on your own free Cloudflare account, behind a Cloudflare Access sign-in that only your email address can pass. You then add it to your iPhone's Home Screen. It takes about 20 minutes, once.

**What stays private.** Your records are encrypted on your phone with your vault passphrase before they are uploaded. Cloudflare stores only the encrypted copy and never gets your passphrase. Cloudflare does see your email address (to sign you in), your account's sign-in ID, the size and timing of requests, and your internet address. Read the privacy notice (PRIVACY.md) before you start.

**What protects it.** There are two locks. Cloudflare Access refuses anyone who can't receive a sign-in code at your email address. Shiftwise then checks Cloudflare's signed sign-in token on every data request itself, so a misconfigured or switched-off Access policy cannot hand your records to anyone else. If the sign-in settings are missing, the data endpoints refuse every request.

## 1. Create the Cloudflare pieces

1. Sign up for a free account at https://dash.cloudflare.com/sign-up.
2. Go to **Storage & databases → D1 SQL database → Create**, name it `shiftwise`, and create it. Copy its **Database ID**.
3. Go to **My Profile → API Tokens → Create Token** and pick the **Edit Cloudflare Workers** template. Under **Permissions**, add **Account · D1 · Edit**. Under **Account Resources**, choose only your account. Create the token and copy it. Cloudflare shows it only once.
4. Copy your **Account ID**. It's in the account home page's menu (⋯ next to your account name → **Copy account ID**).

## 2. Give the repository those settings

On GitHub, open the repository's **Settings → Secrets and variables → Actions**.

- **Secrets** tab → **New repository secret**: add `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID`.
- **Variables** tab → **New repository variable**: add `CLOUDFLARE_D1_DATABASE_ID` (the database ID).

Never paste the token into an issue, a commit or a chat.

## 3. Deploy

Open **Actions → Deploy website to Cloudflare → Run workflow** (it also runs on every update to `main`). It runs the tests, sets up the database table and publishes the site at `https://shiftwise.<your-subdomain>.workers.dev`. The run warns that sign-in isn't configured yet. That's expected: the data endpoints refuse requests until step 4.

## 4. Turn on the sign-in

1. In Cloudflare go to **Workers & Pages → shiftwise → Settings → Domains & Routes**. Next to `workers.dev`, choose **Enable Cloudflare Access**. If Cloudflare asks you to set up Zero Trust first, pick a team name and the **Free** plan. It may ask for a payment card even on the free plan.
2. Choose **Manage Cloudflare Access**. Edit the policy so that it **Allows** only **Include → Emails →** your own email address. Remove any broader rule, such as "everyone in the organization" or an email domain.
3. Set the **Session duration**. A longer session means fewer sign-ins on your phone. A shorter one limits what a stolen, unlocked phone could reach. Your vault passphrase and the vault's 5-minute auto-lock protect your records either way. One month is a reasonable choice for a phone with a passcode.
4. Copy the application's **Audience (AUD) tag** (on the application's overview or **Basic information** page). Copy your **team domain**, which looks like `yourteam.cloudflareaccess.com` (Zero Trust → **Settings**).
5. Back on GitHub, add two more **Variables**: `CLOUDFLARE_ACCESS_TEAM_DOMAIN` (for example `yourteam.cloudflareaccess.com`, without `https://`) and `CLOUDFLARE_ACCESS_AUD`.
6. Run the deploy workflow again.

**Check it.** Open your workers.dev address in a private browser window. You should see a Cloudflare sign-in page, not Shiftwise. Enter another email address: no code should arrive. Then sign in with yours.

## 5. Put it on your iPhone

1. Open your workers.dev address in **Safari** and sign in with the emailed code.
2. Tap **Share → Add to Home Screen → Add**.
3. Open **Shiftwise from the Home Screen**. It keeps its own storage, separate from Safari, so you sign in once more there.
4. Create your vault passphrase (at least 16 characters, written down somewhere safe; it cannot be reset). Wait until **Pay settings** shows **Offline ready on this device**.

iOS may delete a Home Screen app's stored data if you don't open it for a while. Your encrypted copy is also on the server, so you can unlock it again after signing in. Still export an encrypted backup now and then (**Pay settings → Export encrypted backup**).

## 6. Shift reminders on your phone (optional)

Needs iOS 16.4 or later and Shiftwise opened from the Home Screen. On the **Work log**, set your usual schedule, then tap **🔔 Remind me after each shift** and allow notifications. Tap **Send test** to check it works. About 10 minutes after each planned shift ends, you get a reminder like "Worked Mon 5:00 AM–2:30 PM? Tap to confirm." Tapping it opens the Work log. You still unlock your vault with your passphrase to confirm.

The deploy workflow creates the signing key for notifications on its first run and stores it as a Cloudflare secret. You don't need to set anything up. Reminders go out within 5 minutes of their time. The phone uploads three weeks of reminders whenever it's unlocked, so open Shiftwise at least every few weeks. Read the phone-reminder section of PRIVACY.md for what the server and Apple can see.

## 7. Bank transactions through Plaid (optional)

Your free Plaid trial allows **10 bank connections in total, and removing one does not free its slot.** So test with Plaid's fake Sandbox bank first, then connect your real banks once.

1. In the Plaid dashboard, open **Developers → Keys**. In GitHub, add three **Secrets**: `PLAID_CLIENT_ID`, `PLAID_SANDBOX_SECRET` and `PLAID_PRODUCTION_SECRET`. Never paste them anywhere else.
2. In the Plaid dashboard, under **Developers → API → Allowed redirect URIs**, add `https://shiftwise.<your-subdomain>.workers.dev/bank.html`.
3. In GitHub, add the **Variable** `PLAID_ENV` with the value `sandbox`, and run the deploy workflow.
4. On the **Money** tab, tap **Connect a bank**. In Plaid's window, pick any bank and sign in with Plaid's test login (username `user_good`, password `pass_good`). Test purchases should appear in your spending within a minute or two. Remove the test connection afterwards. Sandbox connections don't count toward your trial's 10.
5. Change `PLAID_ENV` to `production` and run the deploy workflow again. Connect Huntington, then Wintrust. Some banks need approval in Plaid's dashboard first (its OAuth institutions page shows the status).

Shiftwise checks for new transactions about every 6 hours. The phone imports them the next time you unlock. Purchases are added to your spending; transfers, income, credit-card payments, refunds and pending charges are left out. You can change any purchase's category, and later updates keep your choice. Cash App isn't available through Plaid, so add Cash App spending by hand. Read the bank-connection section of PRIVACY.md first.

## Limits and notes

- **Existing records.** A new vault on this site starts empty. Records in the Android or Linux apps or on the old Sites website don't move over automatically, and encrypted backups from them can't be restored into a vault made with a different passphrase setup.
- **Cost.** One person's use fits comfortably in Cloudflare's free Workers, D1 and Zero Trust plans. Check Cloudflare's current plan limits if that changes.
- **Updates.** Each change merged into `main` redeploys automatically. Open the Home Screen app online now and then to pick up updates.
- **Turning it off.** Delete the `shiftwise` Worker and the D1 database in Cloudflare, and delete the GitHub secrets and variables. Deleting the database erases the encrypted server copy; your phone keeps its own copy until you remove the Home Screen app's data.
