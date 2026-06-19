#!/usr/bin/env ruby
# Fügt die GymTrackWidget-Extension zum Xcode-Projekt hinzu.
# Wird von Codemagic vor dem Build ausgeführt.
# Benötigt: gem install xcodeproj

require 'xcodeproj'
require 'fileutils'

PROJECT_PATH    = 'ios/App/App.xcodeproj'
WIDGET_DIR      = 'ios/App/GymTrackWidget'
MAIN_BUNDLE_ID  = 'com.wolter.gymtrack'
WIDGET_BUNDLE_ID = "#{MAIN_BUNDLE_ID}.widget"
APP_GROUP       = "group.#{MAIN_BUNDLE_ID}"
MIN_IOS_VERSION = '16.1'

project = Xcodeproj::Project.open(PROJECT_PATH)

# ── App-Target: Entitlements IMMER erzwingen ─────────────────
# Ohne CODE_SIGN_ENTITLEMENTS wird App/App.entitlements nie eingebettet →
# "Sign in with Apple" fehlt in der fertigen App → AuthorizationError 1000.
# Läuft vor dem early-exit, damit es bei jedem Build greift.
app_target = project.targets.find { |t| t.name == 'App' }
if app_target
  app_target.build_configurations.each do |config|
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  end
  project.save
  puts '✅ App-Target CODE_SIGN_ENTITLEMENTS = App/App.entitlements gesetzt.'
end

# ── Extension schon da? ──────────────────────────────────────
if project.targets.any? { |t| t.name == 'GymTrackWidget' }
  puts '✅ GymTrackWidget-Target bereits vorhanden – überspringe.'
  exit 0
end

# ── Neues Widget-Extension-Target ────────────────────────────
widget_target = project.new_target(
  :app_extension,
  'GymTrackWidget',
  :ios,
  MIN_IOS_VERSION,
  project.products_group
)

# ── Build-Konfigurationen ─────────────────────────────────────
['Debug', 'Release'].each do |config_name|
  config = widget_target.build_configurations.find { |c| c.name == config_name }
  config.build_settings.merge!({
    'PRODUCT_NAME'                    => 'GymTrackWidget',
    'PRODUCT_BUNDLE_IDENTIFIER'       => WIDGET_BUNDLE_ID,
    'INFOPLIST_FILE'                  => 'GymTrackWidget/Info.plist',
    'CODE_SIGN_ENTITLEMENTS'          => 'GymTrackWidget/GymTrackWidget.entitlements',
    'SWIFT_VERSION'                   => '5.0',
    'IPHONEOS_DEPLOYMENT_TARGET'      => MIN_IOS_VERSION,
    'TARGETED_DEVICE_FAMILY'          => '1',
    'MARKETING_VERSION'               => '1.0.2',
    'CURRENT_PROJECT_VERSION'         => '$(inherited)',
    'CODE_SIGN_STYLE'                 => 'Automatic',
    'SKIP_INSTALL'                    => 'YES',
    'LD_RUNPATH_SEARCH_PATHS'         => '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks',
    'APPLICATION_EXTENSION_API_ONLY'  => 'YES',
  })
end

# ── Haupt-App-Target als Dependency ──────────────────────────
main_target = project.targets.find { |t| t.name == 'App' }
main_target.add_dependency(widget_target)

# ── Widget-Quell-Gruppe erstellen ─────────────────────────────
widget_group = project.main_group.new_group('GymTrackWidget', 'GymTrackWidget')

swift_files = Dir["#{WIDGET_DIR}/*.swift"].map { |f| File.basename(f) }
swift_files.each do |filename|
  ref = widget_group.new_reference(filename)
  widget_target.add_file_references([ref])
end

# Info.plist einbinden
plist_ref = widget_group.new_reference('Info.plist')
widget_target.build_configurations.each do |config|
  config.build_settings['INFOPLIST_FILE'] = "GymTrackWidget/Info.plist"
end

# ── App-Target: Embed-Phase für Extension ────────────────────
embed_phase = main_target.new_copy_files_build_phase('Embed Foundation Extensions')
embed_phase.dst_subfolder_spec = '13' # PlugIns
embed_phase.add_file_reference(
  widget_target.product_reference
)

puts "✅ GymTrackWidget-Target erfolgreich hinzugefügt."
puts "   Bundle-ID: #{WIDGET_BUNDLE_ID}"
puts "   Min iOS: #{MIN_IOS_VERSION}"
puts "   Swift-Dateien: #{swift_files.join(', ')}"

project.save
