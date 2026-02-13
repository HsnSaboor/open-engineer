const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "index.html");

function test() {
  if (!fs.existsSync(filePath)) {
    console.error("FAIL: index.html does not exist");
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const failures = [];

  const requirements = [
    { name: "Tailwind CSS CDN", pattern: /cdn\.tailwindcss\.com/ },
    { name: "Lucide Icons CDN", pattern: /unpkg\.com\/lucide/ },
    { name: "Base CSS (Dark Theme)", pattern: /#09090b/ },
    { name: "Desktop Layout", pattern: /id="desktop"/ },
    { name: "Taskbar Layout", pattern: /id="taskbar"/ },
    { name: "App Grid Layout", pattern: /id="app-grid"/ },
    { name: "Placeholder: ZenFlowState", pattern: /<!-- ZenFlowState -->/ },
    { name: "Placeholder: WindowManager", pattern: /<!-- WindowManager -->/ },
    { name: "CommandPalette Class", pattern: /class CommandPalette/ },
    { name: "SystemManager Class", pattern: /class SystemManager/ },
    { name: "Ctrl+K Shortcut", pattern: /Ctrl\+K/i },
    { name: "Export Workspace", pattern: /zenflow_workspace\.json/ },
    { name: "Clear Data", pattern: /localStorage\.clear\(\)/ },
    { name: "Fade-in Animation", pattern: /@keyframes fadeIn/ },
  ];

  requirements.forEach((req) => {
    if (!req.pattern.test(content)) {
      failures.push(req.name);
    }
  });

  if (failures.length > 0) {
    console.error("FAIL: Missing requirements: " + failures.join(", "));
    process.exit(1);
  }

  console.log("PASS: index.html meets all requirements");
}

test();
