# Subly — DaVinci Resolve Subtitle Toolkit

![License](https://img.shields.io/badge/license-MIT-blue)
![Release](https://img.shields.io/github/v/release/Shinsha1337/subly)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)

Turn subtitle tracks into beautifully formatted Fusion **Text+** captions with live timeline preview, smart phrase regrouping, per-word emphasis, and a built-in editor.

Runs directly inside **DaVinci Resolve Studio** as a native Workflow Integration plugin.

<img width="1221" height="1019" alt="Subly in DaVinci Resolve Studio" src="https://github.com/user-attachments/assets/d4065e9f-62ec-409a-8ab9-fb89dfd471d2" />

## Features

- **Text+ Generation:** Converts subtitle tracks into styled Fusion Text+ clips with live timeline preview.
- **Smart Regrouping:** Rephrase by Whole Sentence, Single Word, or Custom word/character limits with full CJK script support.
- **Timeline Sync:** Bi-directional sync — send subtitles to the timeline for fine-tuning, then pull them back.
- **Built-in Editor:** Search, split, merge, undo/redo, and inline word corrections.
- **Per-Word Emphasis:** Customize color, relative size, and font weight per word.
- **Font & Color Tools:** Searchable system-font browser with favorites and a persistent saved-color palette.
- **Presets & Themes:** Reusable styling presets, dark/light/system themes, and native titlebar controls.

## Requirements

- **DaVinci Resolve Studio 18.5+** *(Workflow Integrations are not available in the free version)*
- **Windows** or **macOS**

## Quick Start

1. Download **`Subly-v1.2.0.zip`** from [Releases](https://github.com/Shinsha1337/subly/releases) and extract it.
2. In DaVinci Resolve Studio, open **Workspace → Console**, select **Lua**, and run `install.lua`.
3. Restart Resolve, then open **Workspace → Workflow Integrations → Subly**.

<details>
<summary><strong>Manual Installation</strong></summary>

If Resolve cannot write to the plugin folder automatically:

1. Copy the `Subly` folder into the Workflow Integration Plugins directory:
   - **Windows:** `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`
   - **macOS:** `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
2. Copy `WorkflowIntegration.node` from the local Resolve SDK (`Developer/Workflow Integrations/Examples/SamplePlugin/`) into the installed `Subly` folder.
3. Restart DaVinci Resolve Studio.

To uninstall, run `uninstall.lua` from the Lua Console.
</details>

## Workflow

```text
1. Template       Pick a Text+ generator and click "Set Preview Caption".
       ↓
2. Transcription  Transcribe audio or pull an existing track. Choose a grouping mode and click "Create Phrases".
       ↓
3. Deliver        Fine-tune text, timing, and word emphasis. Click "Create Captions" to bake to the timeline.
```

## Development

```shell
cd Subly
npm ci
npm test
npm run build
```

The pre-built UI ships in `Subly/dist` — end users do not need Node.js or npm.

## Support

If Subly saves you time, consider leaving a ⭐ on GitHub.  
To support development: 💜 [Boosty](https://boosty.to/shinsha)

## License

[MIT](LICENSE) © 2026 [shinsha](https://github.com/Shinsha1337).  
*The `WorkflowIntegration.node` module belongs to Blackmagic Design and is not covered by this license.*
