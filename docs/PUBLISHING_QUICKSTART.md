# Publishing Quickstart — Tiflis Code

> Step-by-step guide for first-time App Store and Play Store submission

**Last Updated:** 2025-12-15

---

## Quick Links

- [iOS App Store](#ios-app-store-publishing)
- [Google Play Store](#google-play-store-publishing)
- [Detailed Materials](APP_STORE_MATERIALS.md) — Screenshots, descriptions, keywords

---

## iOS App Store Publishing

### Prerequisites

- [ ] Apple Developer Program membership ($99/year) — [developer.apple.com](https://developer.apple.com)
- [ ] Xcode 16.1+ installed
- [ ] XcodeGen installed (`brew install xcodegen`)

### Step 1: Configure Apple Developer Account (10 min)

1. **Go to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/)**

2. **Create App ID:**
   - Identifiers → + → App IDs → App
   - Description: `Tiflis Code`
   - Bundle ID: `io.tiflis.TiflisCode` (Explicit)
   - Capabilities: ✅ App Groups
   - Register

3. **Create App Group:**
   - Identifiers → + → App Groups
   - Description: `Tiflis Code Group`
   - Identifier: `group.io.tiflis.TiflisCode`
   - Register

4. **Create watchOS App ID:**
   - Identifiers → + → App IDs → App
   - Description: `Tiflis Code Watch`
   - Bundle ID: `io.tiflis.TiflisCode.watchkitapp` (Explicit)
   - Capabilities: ✅ App Groups
   - Register

5. **Note your Team ID** (shown in top-right or Membership details)

### Step 2: Configure Xcode Project (5 min)

1. **Edit `apps/TiflisCode/project.yml`:**

```yaml
settings:
  base:
    SWIFT_VERSION: "6.0"
    DEVELOPMENT_TEAM: "YOUR_TEAM_ID"  # Replace with your Team ID
```

2. **Regenerate and open project:**

```bash
cd apps/TiflisCode
xcodegen generate
open TiflisCode.xcodeproj
```

3. **In Xcode, verify signing:**
   - Select TiflisCode target → Signing & Capabilities
   - Team: Select your team
   - Bundle Identifier: `io.tiflis.TiflisCode`
   - ✅ Automatically manage signing

4. **Repeat for TiflisCodeWatch target**

### Step 3: Create App in App Store Connect (10 min)

1. **Go to [App Store Connect](https://appstoreconnect.apple.com) → Apps → +**

2. **New App:**
   - Platform: iOS
   - Name: `Tiflis Code`
   - Primary Language: English (U.S.)
   - Bundle ID: `io.tiflis.TiflisCode`
   - SKU: `tiflis-code-ios`

3. **App Information tab:**
   - Subtitle: `AI Coding Agents, Mobile`
   - Category: Developer Tools
   - Secondary Category: Productivity
   - Content Rights: Does not contain third-party content
   - Age Rating: Complete questionnaire → 4+

4. **App Privacy tab:**
   - Privacy Policy URL: `https://tiflis.io/privacy`
   - Data Collection: Select "Data Not Collected"

5. **Pricing and Availability:**
   - Price: Free

### Step 4: Build and Upload (15 min)

1. **Set version in Xcode:**
   - Select TiflisCode target → General
   - Version: `1.0.0`
   - Build: `1`

2. **Create Archive:**
   - Select destination: `Any iOS Device (arm64)`
   - Product → Archive
   - Wait for build (5-10 min)

3. **Upload to App Store Connect:**
   - Window → Organizer
   - Select your archive → Distribute App
   - Select: App Store Connect → Upload
   - Check all boxes → Next → Upload
   - Wait for processing (10-30 min)

### Step 5: Submit for Review (15 min)

1. **In App Store Connect → Your App → iOS App:**

2. **Version Information:**
   - Screenshots: Upload for all required sizes (see [APP_STORE_MATERIALS.md](APP_STORE_MATERIALS.md#screenshots))
   - Promotional Text: `Control Cursor, Claude Code & OpenCode from your iPhone...`
   - Description: Copy from [APP_STORE_MATERIALS.md](APP_STORE_MATERIALS.md#description-4000-characters-max)
   - Keywords: `ai,coding,cursor,claude,voice,terminal,developer,remote,ssh,opencode`
   - Support URL: `https://github.com/tiflis-io/tiflis-code`
   - Marketing URL: `https://tiflis.io`

3. **Build:**
   - Select the uploaded build

4. **App Review Information:**
   - Contact: Your name, email, phone
   - Notes: Copy from [APP_STORE_MATERIALS.md](APP_STORE_MATERIALS.md#review-notes)

5. **Submit for Review**

### iOS Timeline

| Step | Time | Notes |
|------|------|-------|
| Account setup | 10 min | One-time |
| Xcode config | 5 min | One-time |
| App Store Connect | 10 min | One-time |
| Build & Upload | 15 min | Per release |
| Fill metadata | 15 min | First time only |
| Apple Review | 24-48 hours | Varies |

---

## Google Play Store Publishing

### Prerequisites

- [ ] Google Play Developer account ($25 one-time) — [play.google.com/console](https://play.google.com/console)
- [ ] Android Studio or JDK 17+ with Gradle
- [ ] Identity verification completed (may take 2-3 days)

### Step 1: Generate Signing Key (5 min)

```bash
cd apps/TiflisCodeAndroid

# Generate upload keystore
keytool -genkeypair -v \
  -keystore upload-keystore.jks \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias upload-key

# You'll be prompted for:
# - Keystore password (remember this!)
# - Key password (can be same as keystore)
# - Your name, organization, location
```

**⚠️ IMPORTANT:** Back up `upload-keystore.jks` securely. If lost, you cannot update your app!

### Step 2: Configure Signing (5 min)

1. **Create `apps/TiflisCodeAndroid/signing.properties`:**

```properties
storeFile=../upload-keystore.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=upload-key
keyPassword=YOUR_KEY_PASSWORD
```

2. **Add to `.gitignore`:**

```bash
echo "upload-keystore.jks" >> .gitignore
echo "signing.properties" >> .gitignore
```

3. **Update `app/build.gradle.kts`:**

Add at the top after plugins:

```kotlin
import java.util.Properties

// Load signing properties
val signingPropertiesFile = rootProject.file("signing.properties")
val signingProperties = Properties()
if (signingPropertiesFile.exists()) {
    signingProperties.load(signingPropertiesFile.inputStream())
}
```

Add inside `android { }` block, before `defaultConfig`:

```kotlin
signingConfigs {
    create("release") {
        if (signingPropertiesFile.exists()) {
            storeFile = file(signingProperties.getProperty("storeFile"))
            storePassword = signingProperties.getProperty("storePassword")
            keyAlias = signingProperties.getProperty("keyAlias")
            keyPassword = signingProperties.getProperty("keyPassword")
        }
    }
}
```

Update release build type:

```kotlin
buildTypes {
    release {
        isMinifyEnabled = true
        isShrinkResources = true
        signingConfig = signingConfigs.getByName("release")  // Add this line
        proguardFiles(
            getDefaultProguardFile("proguard-android-optimize.txt"),
            "proguard-rules.pro"
        )
    }
}
```

### Step 3: Build Release Bundle (5 min)

```bash
cd apps/TiflisCodeAndroid

# Build release AAB
./gradlew bundleRelease

# Output: app/build/outputs/bundle/release/app-release.aab
```

Verify the bundle is signed:

```bash
# Check signature
jarsigner -verify -verbose app/build/outputs/bundle/release/app-release.aab
```

### Step 4: Create App in Play Console (15 min)

1. **Go to [Google Play Console](https://play.google.com/console) → Create app**

2. **App details:**
   - App name: `Tiflis Code`
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free
   - Accept declarations

3. **Set up your app (left sidebar):**

   **App access:**
   - Select: All functionality is available without special access

   **Ads:**
   - Select: No, my app does not contain ads

   **Content rating:**
   - Start questionnaire
   - Category: Utility, Productivity, Communication, or other
   - Answer all questions → Get rating
   - Expected result: Rated for Everyone

   **Target audience:**
   - Select: 18 and over (developer tool)
   - Confirm not primarily child-directed

   **News apps:**
   - Select: No, my app is not a news app

   **Data safety:**
   - Data collection: No user data collected
   - Security practices: Data encrypted in transit ✅
   - Complete all sections → Submit

   **Government apps:**
   - Select: No

4. **Store presence → Main store listing:**

   - App name: `Tiflis Code`
   - Short description (80 chars):
     ```
     Control AI coding agents (Cursor, Claude, OpenCode) with voice from your phone.
     ```
   - Full description: Copy from [APP_STORE_MATERIALS.md](APP_STORE_MATERIALS.md#full-description-4000-characters-max)

5. **Graphics:**
   - App icon: 512 × 512 PNG
   - Feature graphic: 1024 × 500 PNG/JPEG
   - Phone screenshots: At least 2 (1080 × 1920 recommended)

6. **Store settings:**
   - App category: Tools
   - Email: support@tiflis.io
   - Website: https://tiflis.io
   - Privacy policy: https://tiflis.io/privacy

### Step 5: Upload and Release (10 min)

1. **Release → Testing → Internal testing → Create new release**

2. **App signing:**
   - Choose "Let Google manage and protect your app signing key" (Recommended)
   - Upload your AAB file

3. **Release details:**
   - Release name: `1.0.0`
   - Release notes:
     ```
     Initial Release

     • Voice-first interface for AI coding assistants
     • Support for Claude Code, Cursor, and OpenCode
     • Full PTY terminal with professional keyboard
     • Real-time streaming responses
     • QR code and magic link setup
     ```

4. **Review and roll out to internal testing**

5. **Add testers:**
   - Create email list
   - Add tester emails
   - Share opt-in link with testers

### Step 6: Promote to Production (5 min)

After testing is complete:

1. **Release → Production → Create new release**

2. **Add from library** → Select your tested release

3. **Review and start rollout**
   - Recommended: Start with 5-10% rollout
   - Increase gradually if no issues

### Android Timeline

| Step | Time | Notes |
|------|------|-------|
| Developer account | Instant-3 days | Identity verification may take time |
| Generate signing key | 5 min | One-time, backup securely! |
| Configure signing | 5 min | One-time |
| Build release | 5 min | Per release |
| Play Console setup | 15 min | First time only |
| Upload & test | 10 min | Per release |
| Google Review | Few hours-3 days | Usually faster than iOS |

---

## Quick Commands Reference

### iOS

```bash
# Navigate to iOS project
cd apps/TiflisCode

# Regenerate Xcode project after project.yml changes
xcodegen generate

# Open in Xcode
open TiflisCode.xcodeproj

# Build from command line (optional)
xcodebuild -scheme TiflisCode -configuration Release archive
```

### Android

```bash
# Navigate to Android project
cd apps/TiflisCodeAndroid

# Build debug APK (for testing)
./gradlew assembleDebug

# Build release AAB (for Play Store)
./gradlew bundleRelease

# Build release APK (for direct distribution)
./gradlew assembleRelease

# Clean build
./gradlew clean

# Run tests
./gradlew test
```

---

## Troubleshooting

### iOS

**"No signing certificate found"**
- Xcode → Preferences → Accounts → Download Manual Profiles
- Or enable "Automatically manage signing"

**"Bundle identifier already in use"**
- Another app is using this Bundle ID
- Check your existing apps in App Store Connect

**"Missing compliance information"**
- Go to TestFlight → Your build → Manage → Export Compliance
- Select "No" if using standard HTTPS encryption only

### Android

**"Keystore was tampered with or password incorrect"**
- Verify password in signing.properties
- Ensure keystore file path is correct (relative to app/ directory)

**"Release build unsigned"**
- Check signing.properties exists and is readable
- Verify signingConfig is set in buildTypes.release

**"Version code already used"**
- Increment versionCode in build.gradle.kts
- Each upload must have a higher versionCode

---

## Post-Publication Checklist

### Both Platforms

- [ ] Verify app appears in store search
- [ ] Test download on real device
- [ ] Check all screenshots display correctly
- [ ] Verify links work (support URL, privacy policy)
- [ ] Monitor crash reports and reviews

### iOS Specific

- [ ] Check TestFlight for any beta feedback
- [ ] Monitor App Analytics in App Store Connect

### Android Specific

- [ ] Review Pre-launch report
- [ ] Check Android vitals for crashes/ANRs
- [ ] Monitor user reviews in Play Console

---

## Next Steps

1. **Set up CI/CD** — Automate builds with GitHub Actions (see [CICD_AND_RELEASE.md](CICD_AND_RELEASE.md))
2. **Screenshots** — Create professional screenshots with captions (see [APP_STORE_MATERIALS.md](APP_STORE_MATERIALS.md#screenshots))
3. **App Preview Video** — Record demo video for App Store
4. **Localization** — Add translations for international markets

---

## Related Documentation

- [APP_STORE_MATERIALS.md](APP_STORE_MATERIALS.md) — Full marketing materials, descriptions, keywords
- [CICD_AND_RELEASE.md](CICD_AND_RELEASE.md) — Automated release workflows
- [RELEASE_SIMPLE.md](RELEASE_SIMPLE.md) — Server packages release guide

---

_Quick start guide for Tiflis Code app publication_
_Last updated: 2025-12-15_
