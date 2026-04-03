# 🌌 Asphyxia CORE Community Plugins (Enhanced)

[![Asphyxia CORE](https://img.shields.io/badge/Asphyxia-CORE-blueviolet?style=for-the-badge)](https://asphyxia-core.github.io/)
[![RyuNET Compatible](https://img.shields.io/badge/RyuNET-Compatible-blue?style=for-the-badge)](https://github.com/Ryu7w7/RyuNET-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/badge/Discord-RyuNET-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/R6xUSKSykQ)

Welcome to the enhanced version of the **Asphyxia CORE Community Plugins**. This repository contains a collection of plugins for rhythm games (SDVX, IIDX) with significant improvements in functionality, synchronization, and user experience.

---

## ✨ New & Exclusive Features

### 🚀 Tachi Sync Scores
Synchronize your scores seamlessly with **Tachi**.
- Automatic or manual score reporting.
- Support for detailed play data.
- Easy configuration via the WebUI.

### 💾 Score Migration
Easily move your data between game versions.
- **Eg to Nabla**: Specialized handlers to migrate your SDVX profiles
- Integrated database update checks to keep your data safe.

### 🔗 RyuNET Compatibility
This version of the plugins is fully optimized and compatible with [RyuNET-core](https://github.com/Ryu7w7/RyuNET-core), ensuring a stable and high-performance environment for your private server.

---

## 🛠 Installation

1. **Pre-requisites**: Ensure you have [Asphyxia CORE](https://asphyxia-core.github.io/) installed.
2. **Download**: Get the latest source code from this repository.
3. **Setup**:
   - Extract the contents into your Asphyxia CORE `plugins` folder.
   - Run `npm install` in the plugin directories to install necessary types (`node`, `lodash`, etc.).
4. **Launch**: Start Asphyxia CORE. Use the `--dev` argument if you want to enable console logs and typechecking for TypeScript.

---

## 🤝 Contributing

Contributions are welcome! This project follows a flexible coding style, but a **Prettier** configuration is included if you'd like to maintain consistent formatting.

- **New Plugins**: Please use the `@asphyxia` identifier (e.g., `gamename@asphyxia`) to avoid database conflicts.
- **Existing Plugins**: If submitting a Pull Request, please include a clear changelog of your changes.

---

## 💬 Community & Support

Join us to discuss new features, report bugs, or just hang out with other rhythm game enthusiasts!

- **RyuNET Discord**: [Join here](https://discord.gg/R6xUSKSykQ)
- **Asphyxia Discord**: [Join here](https://discord.gg/3TW3BDm)
- **Documentation**: [Asphyxia TypeDoc](https://asphyxia-core.github.io/typedoc/)