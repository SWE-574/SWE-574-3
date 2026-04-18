const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const androidDir = path.join(projectRoot, "android");
const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
const localPropertiesPath = path.join(androidDir, "local.properties");

function ensureAndroidSdkPath() {
  const sdkPath =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.HOME || "", "Library", "Android", "sdk");

  if (!sdkPath || !fs.existsSync(sdkPath) || !fs.existsSync(androidDir)) {
    return;
  }

  fs.writeFileSync(localPropertiesPath, `sdk.dir=${sdkPath}\n`, "utf8");
}

function ensureFirebaseNotificationOverride() {
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf8");
  const target =
    '<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notification_icon_color"/>';

  if (!manifest.includes(target) || manifest.includes('tools:replace="android:resource"')) {
    return;
  }

  const updatedManifest = manifest.replace(
    target,
    '<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notification_icon_color" tools:replace="android:resource"/>'
  );

  fs.writeFileSync(manifestPath, updatedManifest, "utf8");
}

ensureAndroidSdkPath();
ensureFirebaseNotificationOverride();
