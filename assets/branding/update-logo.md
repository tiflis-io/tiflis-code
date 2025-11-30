# Update Logo PNG Assets

This command regenerates all PNG logo assets from updated SVG logos for iOS and watchOS apps, including Tiflis logo, third-party agent icons, app icons, and watchOS complications.

## Source Files
- **Tiflis Logo**: `assets/branding/logo.svg` (main Tiflis Code logo)
- **Agent Icons**: `assets/branding/third-party/` directory
  - `CursorLogo.svg` - Cursor agent logo
  - `ClaudeLogo.svg` - Claude/Anthropic agent logo  
  - `opencode-logo-dark.svg` - OpenCode dark theme logo
  - `opencode-logo-light.svg` - OpenCode light theme logo
- **Features**: Solid colors (no opacity), optimized structure, repositioned arrow

## Target Locations

### Tiflis In-App Logo
- **iOS App**: `apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/`
- **watchOS App**: `apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/TiflisLogo.imageset/`
- **Files to replace**:
  - `TiflisLogo.png` (1x - 80x80px)
  - `TiflisLogo@2x.png` (2x - 160x160px) 
  - `TiflisLogo@3x.png` (3x - 240x240px)

### Agent Icons (In-App)
- **iOS App**: `apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/`
  - `CursorLogo.imageset/`
  - `ClaudeLogo.imageset/`
  - `OpenCodeLogo.imageset/` (theme-aware)
- **watchOS App**: `apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/`
  - `CursorLogo.imageset/`
  - `ClaudeLogo.imageset/`
  - `OpenCodeLogo.imageset/` (theme-aware)

### App Icons (Home Screen)
- **iOS App**: `apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/`
  - **iPhone**: `Icon-20@2x.png` (80x80), `Icon-20@3x.png` (120x120), `Icon-29@2x.png` (58x58), `Icon-29@3x.png` (87x87), `Icon-40@2x.png` (80x80), `Icon-40@3x.png` (120x120), `Icon-60@2x.png` (120x120), `Icon-60@3x.png` (180x180)
  - **iPad**: `Icon-20.png` (40x40), `Icon-29.png` (29x29), `Icon-40.png` (40x40), `Icon-76@2x.png` (152x152), `Icon-83.5@2x.png` (167x167)
  - **App Store**: `Icon-1024.png` (1024x1024)
- **watchOS App**: `apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/`
  - **All sizes**: `Icon-24@2x.png` (48x48), `Icon-27.5@2x.png` (55x55), `Icon-29@2x.png` (58x58), `Icon-29@3x.png` (87x87), `Icon-40@2x.png` (80x80), `Icon-44@2x.png` (88x88), `Icon-86@2x.png` (172x172), `Icon-98@2x.png` (196x196), `Icon-108@2x.png` (216x216)

### WatchOS Complications
- **watchOS App**: `apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/`
  - `ComplicationIcon.imageset/` (for various complication families)

## Quick Regeneration Script

### Fast iOS + watchOS App Icons Only (Recommended for Quick Updates)
```bash
cd assets/branding/

# Generate all iOS app icons in parallel (fastest)
(
  rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@2x.png &
  rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@3x.png &
  rsvg-convert -w 58 -h 58 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@2x.png &
  rsvg-convert -w 87 -h 87 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@3x.png &
  rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@2x.png &
  rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@3x.png &
  rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@2x.png &
  rsvg-convert -w 180 -h 180 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@3x.png &
  rsvg-convert -w 40 -h 40 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20.png &
  rsvg-convert -w 29 -h 29 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29.png &
  rsvg-convert -w 40 -h 40 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40.png &
  rsvg-convert -w 152 -h 152 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-76@2x.png &
  rsvg-convert -w 167 -h 167 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-83.5@2x.png &
  rsvg-convert -w 1024 -h 1024 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-1024.png &
  wait
)

echo "✅ All iOS app icons generated!"
```

### One-Command Update (Full Regeneration)
```bash
cd assets/branding/
./update-all-logos.sh
```

### Fast Selective Updates
```bash
# Update only Tiflis logo
./update-all-logos.sh --tiflis-only

# Update only agent icons  
./update-all-logos.sh --agents-only

# Update only app icons (iOS + watchOS)
./update-all-logos.sh --app-icons-only

# Update only watchOS assets
./update-all-logos.sh --watchos-only
```

### Manual Generation Commands

#### Using rsvg-convert (recommended)
```bash
cd assets/branding/

# Tiflis Logo - iOS In-App
rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo.png
rsvg-convert -w 160 -h 160 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@2x.png
rsvg-convert -w 240 -h 240 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@3x.png

# Tiflis Logo - watchOS In-App
rsvg-convert -w 48 -h 48 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo.png
rsvg-convert -w 96 -h 96 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@2x.png

# Agent Icons - iOS (48x48 for sidebar, 32x32 for compact)
rsvg-convert -w 48 -h 48 third-party/CursorLogo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/CursorLogo.imageset/CursorLogo.png
rsvg-convert -w 96 -h 96 third-party/CursorLogo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/CursorLogo.imageset/CursorLogo@2x.png
rsvg-convert -w 144 -h 144 third-party/CursorLogo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/CursorLogo.imageset/CursorLogo@3x.png

rsvg-convert -w 48 -h 48 third-party/ClaudeLogo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/ClaudeLogo.imageset/ClaudeLogo.png
rsvg-convert -w 96 -h 96 third-party/ClaudeLogo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/ClaudeLogo.imageset/ClaudeLogo@2x.png
rsvg-convert -w 144 -h 144 third-party/ClaudeLogo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/ClaudeLogo.imageset/ClaudeLogo@3x.png

# OpenCode (theme-aware - generate both variants)
rsvg-convert -w 48 -h 48 third-party/opencode-logo-dark.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/OpenCodeLogo.imageset/OpenCodeLogo~dark.png
rsvg-convert -w 96 -h 96 third-party/opencode-logo-dark.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/OpenCodeLogo.imageset/OpenCodeLogo@2x~dark.png
rsvg-convert -w 144 -h 144 third-party/opencode-logo-dark.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/OpenCodeLogo.imageset/OpenCodeLogo@3x~dark.png

rsvg-convert -w 48 -h 48 third-party/opencode-logo-light.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/OpenCodeLogo.imageset/OpenCodeLogo~light.png
rsvg-convert -w 96 -h 96 third-party/opencode-logo-light.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/OpenCodeLogo.imageset/OpenCodeLogo@2x~light.png
rsvg-convert -w 144 -h 144 third-party/opencode-logo-light.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/OpenCodeLogo.imageset/OpenCodeLogo@3x~light.png

# Agent Icons - watchOS (smaller sizes)
rsvg-convert -w 32 -h 32 third-party/CursorLogo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/CursorLogo.imageset/CursorLogo.png
rsvg-convert -w 64 -h 64 third-party/CursorLogo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/CursorLogo.imageset/CursorLogo@2x.png

rsvg-convert -w 32 -h 32 third-party/ClaudeLogo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/ClaudeLogo.imageset/ClaudeLogo.png
rsvg-convert -w 64 -h 64 third-party/ClaudeLogo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/ClaudeLogo.imageset/ClaudeLogo@2x.png

# iOS App Icons (all sizes - matches AppIcon.appiconset/Contents.json)
# iPhone icons
rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@2x.png
rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@3x.png
rsvg-convert -w 58 -h 58 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@2x.png
rsvg-convert -w 87 -h 87 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@3x.png
rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@2x.png
rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@3x.png
rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@2x.png
rsvg-convert -w 180 -h 180 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@3x.png
# iPad icons
rsvg-convert -w 40 -h 40 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20.png
rsvg-convert -w 29 -h 29 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29.png
rsvg-convert -w 40 -h 40 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40.png
rsvg-convert -w 152 -h 152 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-76@2x.png
rsvg-convert -w 167 -h 167 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-83.5@2x.png
# App Store icon
rsvg-convert -w 1024 -h 1024 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-1024.png

# watchOS App Icons
rsvg-convert -w 48 -h 48 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-24@2x.png
rsvg-convert -w 55 -h 55 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-27.5@2x.png
rsvg-convert -w 58 -h 58 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-29@2x.png
rsvg-convert -w 87 -h 87 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-29@3x.png
rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-40@2x.png
rsvg-convert -w 88 -h 88 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-44@2x.png
rsvg-convert -w 172 -h 172 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-86@2x.png
rsvg-convert -w 196 -h 196 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-98@2x.png
rsvg-convert -w 216 -h 216 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-108@2x.png

# watchOS Complication Icons
rsvg-convert -w 32 -h 32 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/ComplicationIcon.imageset/ComplicationIcon.png
rsvg-convert -w 64 -h 64 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/ComplicationIcon.imageset/ComplicationIcon@2x.png
rsvg-convert -w 96 -h 96 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/ComplicationIcon.imageset/ComplicationIcon@3x.png
```

#### Using ImageMagick (alternative)
```bash
cd assets/branding/

# In-App Logo
convert -background transparent -density 300 -resize 80x80 logo.svg ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo.png
convert -background transparent -density 300 -resize 160x160 logo.svg ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@2x.png
convert -background transparent -density 300 -resize 240x240 logo.svg ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@3x.png

# App Icons (simplified - use rsvg-convert for better precision)
# See rsvg-convert commands above for exact sizes
```

## Quality Requirements
- **Transparency**: Maintain transparent background for rounded corners
- **Anti-aliasing**: Enable smooth edges for high-quality rendering
- **Color accuracy**: Preserve exact colors from SVG (#2E5AA6, #6F4ABF, #111, #fff)
- **Compression**: Use lossless PNG compression for best quality

## Verification Steps
1. **Xcode Preview**: Open Assets.xcassets in Xcode to verify proper display
2. **Simulator Testing**: Test on iOS Simulator (iPhone 16 Pro recommended)
3. **Device Testing**: Test on actual iOS device if available
4. **Background Testing**: Verify appearance on both light and dark backgrounds
5. **Scaling Test**: Check sharpness at different screen densities
6. **Accessibility**: Ensure VoiceOver reads alt text correctly

## Additional Considerations
- **WatchOS**: Currently shares same TiflisLogo assets with iOS app
- **App Icons**: Now included in this update process
- **Color Consistency**: New solid colors should match across all platforms
- **Version Control**: Commit PNG changes after successful testing
- **Asset Catalog**: AppIcon.appiconset Contents.json is automatically configured

## Troubleshooting
- **Blurry edges**: Increase DPI setting or enable anti-aliasing
- **Color shift**: Ensure color profile is maintained during conversion
- **Transparency issues**: Verify background is properly set to transparent
- **Size mismatch**: Double-check pixel dimensions match expected sizes

## Automation

### Update Script
Create `assets/branding/update-logo.sh` for one-command regeneration:

```bash
#!/bin/bash
set -e

echo "🔄 Updating logo assets from SVG..."

cd "$(dirname "$0")"

# Check if logo.svg exists
if [[ ! -f "logo.svg" ]]; then
    echo "❌ logo.svg not found in assets/branding/"
    exit 1
fi

# Check if rsvg-convert is available
if ! command -v rsvg-convert &> /dev/null; then
    echo "❌ rsvg-convert not found. Install with: brew install librsvg"
    exit 1
fi

echo "📱 Generating in-app logo..."
rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo.png
rsvg-convert -w 160 -h 160 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@2x.png
rsvg-convert -w 240 -h 240 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/TiflisLogo@3x.png

echo "🏠 Generating iOS app icons (parallel execution for speed)..."
(
  # iPhone icons
  rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@2x.png &
  rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20@3x.png &
  rsvg-convert -w 58 -h 58 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@2x.png &
  rsvg-convert -w 87 -h 87 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29@3x.png &
  rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@2x.png &
  rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40@3x.png &
  rsvg-convert -w 120 -h 120 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@2x.png &
  rsvg-convert -w 180 -h 180 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-60@3x.png &
  # iPad icons
  rsvg-convert -w 40 -h 40 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-20.png &
  rsvg-convert -w 29 -h 29 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-29.png &
  rsvg-convert -w 40 -h 40 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-40.png &
  rsvg-convert -w 152 -h 152 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-76@2x.png &
  rsvg-convert -w 167 -h 167 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-83.5@2x.png &
  # App Store icon
  rsvg-convert -w 1024 -h 1024 logo.svg -o ../../apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/Icon-1024.png &
  wait
)

echo "⌚ Generating watchOS app icons (if WatchIcon.appiconset exists)..."
if [ -d "../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset" ]; then
  (
    rsvg-convert -w 48 -h 48 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-24@2x.png &
    rsvg-convert -w 55 -h 55 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-27.5@2x.png &
    rsvg-convert -w 58 -h 58 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-29@2x.png &
    rsvg-convert -w 87 -h 87 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-29@3x.png &
    rsvg-convert -w 80 -h 80 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-40@2x.png &
    rsvg-convert -w 88 -h 88 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-44@2x.png &
    rsvg-convert -w 172 -h 172 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-86@2x.png &
    rsvg-convert -w 196 -h 196 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-98@2x.png &
    rsvg-convert -w 216 -h 216 logo.svg -o ../../apps/TiflisCode/TiflisCodeWatch/Resources/Assets.xcassets/WatchIcon.appiconset/Icon-108@2x.png &
    wait
  )
fi

echo "✅ Logo assets updated successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Open apps/TiflisCode/TiflisCode.xcodeproj"
echo "2. Clean Build Folder (⌘+Shift+K)"
echo "3. Delete app from simulator"
echo "4. Build and run (⌘R)"
echo "5. Verify both in-app logo and home screen icon"
```

### CI/CD Integration
Automated updates when logo.svg changes are detected:

```bash
# .github/workflows/ci.yml or similar
if git diff --name-only HEAD~1 HEAD | grep "assets/branding/logo.svg"; then
    echo "🔄 Logo updated, regenerating PNG assets..."
    cd assets/branding/
    ./update-logo.sh
    git add apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/TiflisLogo.imageset/*.png
    git add apps/TiflisCode/TiflisCode/Resources/Assets.xcassets/AppIcon.appiconset/*.png
fi
```