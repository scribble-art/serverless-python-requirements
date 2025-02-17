const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');

const spawn = require('child-process-ext/spawn');
const tomlParse = require('@iarna/toml/parse-string');

/**
 * poetry install
 */
async function pyprojectTomlToRequirements(modulePath, pluginInstance) {
  const { serverless, servicePath, options, log, progress } = pluginInstance;

  const moduleProjectPath = path.join(servicePath, modulePath);
  if (!options.usePoetry || !isPoetryProject(moduleProjectPath)) {
    return;
  }

  let generateRequirementsProgress;
  if (progress && log) {
    generateRequirementsProgress = progress.get(
      'python-generate-requirements-toml'
    );
    generateRequirementsProgress.update(
      'Generating requirements.txt from "pyproject.toml"'
    );
    log.info('Generating requirements.txt from "pyproject.toml"');
  } else {
    serverless.cli.log('Generating requirements.txt from pyproject.toml...');
  }

  try {
    try {
      await spawn(
        'poetry',
        [
          'export',
          '--without-hashes',
          '-f',
          'requirements.txt',
          '-o',
          'requirements.txt',
          '--with-credentials',
        ],
        {
          cwd: moduleProjectPath,
        }
      );
    } catch (e) {
      if (
        e.stderrBuffer &&
        e.stderrBuffer.toString().includes('command not found')
      ) {
        throw new serverless.classes.Error(
          `poetry not found! Install it according to the poetry docs.`,
          'PYTHON_REQUIREMENTS_POETRY_NOT_FOUND'
        );
      }
      throw e;
    }

    const editableFlag = new RegExp(/^-e /gm);
    const sourceRequirements = path.join(moduleProjectPath, 'requirements.txt');
    const requirementsContents = fse.readFileSync(sourceRequirements, {
      encoding: 'utf-8',
    });

    if (requirementsContents.match(editableFlag)) {
      if (log) {
        log.info('The generated file contains -e flags, removing them');
      } else {
        serverless.cli.log(
          'The generated file contains -e flags, removing them...'
        );
      }
      fse.writeFileSync(
        sourceRequirements,
        requirementsContents.replace(editableFlag, '')
      );
    }

    fse.ensureDirSync(path.join(servicePath, '.serverless'));
    fse.moveSync(
      sourceRequirements,
      path.join(servicePath, '.serverless', modulePath, 'requirements.txt'),
      { overwrite: true }
    );
  } finally {
    generateRequirementsProgress && generateRequirementsProgress.remove();
  }
}

/**
 * Check if pyproject.toml file exists and is a poetry project.
 */
function isPoetryProject(servicePath) {
  const pyprojectPath = path.join(servicePath, 'pyproject.toml');

  if (!fse.existsSync(pyprojectPath)) {
    return false;
  }

  const pyprojectToml = fs.readFileSync(pyprojectPath);
  const pyproject = tomlParse(pyprojectToml);

  const buildSystemReqs =
    (pyproject['build-system'] && pyproject['build-system']['requires']) || [];

  for (var i = 0; i < buildSystemReqs.length; i++) {
    if (buildSystemReqs[i].startsWith('poetry')) {
      return true;
    }
  }

  return false;
}

module.exports = { pyprojectTomlToRequirements, isPoetryProject };
