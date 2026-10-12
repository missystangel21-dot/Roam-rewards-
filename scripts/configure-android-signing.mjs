import fs from "node:fs";
import path from "node:path";

const buildGradlePath = path.resolve("android/app/build.gradle");
if (!fs.existsSync(buildGradlePath)) {
  throw new Error(`Expected generated Gradle file at ${buildGradlePath}`);
}

let source = fs.readFileSync(buildGradlePath, "utf8");
if (!source.includes("    signingConfigs {")) {
  throw new Error("Could not find the Android signingConfigs block");
}

const releaseSigning = `        release {
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
            }
            storeFile keystoreProperties["storeFile"] ? file(keystoreProperties["storeFile"]) : null
            storePassword keystoreProperties["storePassword"]
            keyAlias keystoreProperties["keyAlias"]
            keyPassword keystoreProperties["keyPassword"]
        }
`;

if (!source.includes('def keystorePropertiesFile = rootProject.file("keystore.properties")')) {
  const signingStart = source.indexOf("    signingConfigs {");
  const buildTypesStart = source.indexOf("    buildTypes {", signingStart);
  if (buildTypesStart < 0) throw new Error("Could not find the Android buildTypes block");
  const signingClose = source.lastIndexOf("    }\n", buildTypesStart);
  if (signingClose < signingStart) throw new Error("Could not find the signingConfigs closing block");
  source = `${source.slice(0, signingClose)}${releaseSigning}${source.slice(signingClose)}`;
}

const buildTypesStart = source.indexOf("    buildTypes {");
const releaseStart = source.indexOf("        release {", buildTypesStart);
if (releaseStart < 0) throw new Error("Could not find buildTypes.release block");
const signingConfigLine = "            signingConfig signingConfigs.release\n";
const releaseBodyStart = source.indexOf("\n", releaseStart) + 1;
if (!source.slice(releaseBodyStart, source.indexOf("\n", releaseBodyStart + 1)).includes("signingConfig signingConfigs.release")) {
  source = `${source.slice(0, releaseBodyStart)}${signingConfigLine}${source.slice(releaseBodyStart)}`;
}

fs.writeFileSync(buildGradlePath, source);
console.log("Configured Android release signing from keystore.properties");
