const fs = require('fs');

const lines = fs.readFileSync('script.js', 'utf8').split('\n');

const files = {
    'js/dashboardBase.js': [],
    'js/dashboardAPI.js': [],
    'js/dashboardCharts.js': [],
    'js/dashboardUI.js': []
};

let currentFile = 'js/dashboardBase.js';
let classOpened = false;

// We need to keep the class definition in dashboardBase.js
// Other files will add to ANDEDashboard.prototype using Object.assign

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('class ANDEDashboard {')) {
        classOpened = true;
        files[currentFile].push(line);
        continue;
    }

    if (line.includes('// ========== CENTRALIZED NETWORK LAYER ==========')) {
        currentFile = 'js/dashboardAPI.js';
        files[currentFile].push(`Object.assign(ANDEDashboard.prototype, {`);
        continue; // skip the comment or push it inside
    } else if (line.includes('// ========== INICIALIZACIÓN DE GRÁFICOS CON HD Y ANIMACIONES ==========')) {
        // close previous Object.assign
        if (currentFile !== 'js/dashboardBase.js') files[currentFile].push(`});`);
        currentFile = 'js/dashboardCharts.js';
        files[currentFile].push(`Object.assign(ANDEDashboard.prototype, {`);
        continue;
    } else if (line.includes('// ========== EVENT LISTENERS PRINCIPALES ==========')) {
        // close previous Object.assign
        if (currentFile !== 'js/dashboardBase.js') files[currentFile].push(`});`);
        currentFile = 'js/dashboardUI.js';
        files[currentFile].push(`Object.assign(ANDEDashboard.prototype, {`);
        continue;
    } else if (line === '}' && currentFile !== 'js/dashboardBase.js' && i > lines.length - 10) {
        // Closing the whole class at the end of the file
        files[currentFile].push(`});`);
        continue;
    }

    // Inside files other than base, we need to convert method definitions to object properties
    // like `method() {` to `method() {` inside Object.assign. But class syntax already matches object literal syntax! 
    // EXCEPT getters/setters or static... but they are regular methods.
    
    files[currentFile].push(line);
}

// Add main logic
const mainJs = `
// js/main.js
document.addEventListener('DOMContentLoaded', () => {
    if (!window.app) {
        window.app = new ANDEDashboard();
        window.app.initialize();
    }
});
`;

if (!fs.existsSync('js')) fs.mkdirSync('js');

for (const [filename, contentLines] of Object.entries(files)) {
    // If it's a prototype assignment, we need a slight adjustment for commas between methods?
    // Actually, Object.assign(ANDEDashboard.prototype, {
    //   method1() {},
    //   method2() {}
    // })
    // If we just copy class body, methods are separated by newlines, not commas! This is invalid JS!
    let content = contentLines.join('\n');
    if (filename !== 'js/dashboardBase.js') {
        // Convert class method syntax to object literal syntax by adding commas before the next method name.
        // This regex tries to find the method boundaries securely is very hard.
    }
}
