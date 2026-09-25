// Android Auto Backup rules: the shop's books go to the owner's Google account,
// the Keystore secrets do not.
//
// Android copies an app's data to Google Drive on its own (daily, on Wi-Fi,
// while charging) and puts it back when the app is reinstalled. Uninstalling
// cannot be stopped or intercepted, so this is what keeps a reinstall from
// starting the shop from zero.
//
// expo-secure-store ships rules of its own, but they INCLUDE only shared
// preferences — and once a rule file has any <include>, Android backs up
// nothing else. The SQLite database (files/SQLite/billing.db) was never in the
// backup. These rules replace them: the database and preferences go in,
// SecureStore stays out (its values are sealed by a Keystore key that does not
// survive a reinstall, so a restored copy could never be read anyway).
//
// The phone's own snapshot folder (files/backups) is left out on purpose — ten
// full JSON copies would crowd Google's 25 MB per-app allowance, and past that
// Android backs up nothing at all.

const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const BACKUP_RULES = 'shop_backup_rules';
const EXTRACTION_RULES = 'shop_data_extraction_rules';

const RULES = `
    <include domain="file" path="SQLite/"/>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>`;

// Android 11 and lower.
const backupXml = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>${RULES}
</full-backup-content>
`;

// Android 12 and higher.
const extractionXml = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>${RULES}
  </cloud-backup>
  <device-transfer>${RULES}
  </device-transfer>
</data-extraction-rules>
`;

function withShopBackup(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = `@xml/${BACKUP_RULES}`;
    app.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_RULES}`;
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupXml);
      fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), extractionXml);
      return cfg;
    },
  ]);
}

module.exports = withShopBackup;
