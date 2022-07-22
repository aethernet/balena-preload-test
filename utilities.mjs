// ============================================================
// UTILITIES

// create folders tree
const makeDirectory = ((directory) => {
    if (!fs.existsSync(directory)){
      fs.mkdirSync(directory.pathStr, 
        { 
          recursive: true, 
          mode: directory.mode 
        }
      );
    }
  });

export const makeDirectories = (paths) => paths.forEach(makeDirectory);
  
const makeFile = ((fileInfo) => fs.writeFileSync(fileInfo.name, 
    fileInfo.val,
    { mode: fileInfo.mode }
  ))  

export const makeFiles = (files) => files.forEach(makeFile);

// UTILITIES
// ============================================================
