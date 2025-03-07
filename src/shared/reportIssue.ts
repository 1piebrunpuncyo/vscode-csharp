/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extension, vscode } from '../vscodeAdapter';
import { Options } from '../shared/options';
import { IHostExecutableResolver } from '../shared/constants/IHostExecutableResolver';
import { basename, dirname } from 'path';
import { DotnetInfo } from './utils/getDotnetInfo';
import { CSharpExtensionId } from '../constants/csharpExtensionId';

export default async function reportIssue(
    vscode: vscode,
    csharpExtVersion: string,
    getDotnetInfo: (dotNetCliPaths: string[]) => Promise<DotnetInfo>,
    shouldIncludeMonoInfo: boolean,
    options: Options,
    dotnetResolver: IHostExecutableResolver,
    monoResolver?: IHostExecutableResolver
) {
    // Get info for the dotnet that the language server executable is run on, not the dotnet the language server will execute user code on.
    let fullDotnetInfo: string | undefined;
    try {
        const info = await dotnetResolver.getHostExecutableInfo(options);
        const dotnetInfo = await getDotnetInfo([dirname(info.path)]);
        fullDotnetInfo = dotnetInfo.FullInfo;
    } catch (error) {
        const message = error instanceof Error ? error.message : `${error}`;
        fullDotnetInfo = message;
    }

    let monoInfo = '';
    if (shouldIncludeMonoInfo && monoResolver) {
        monoInfo = await getMonoIfPlatformValid(options, monoResolver);
    }

    const extensions = getInstalledExtensions(vscode);

    const useOmnisharp = options.commonOptions.useOmnisharpServer;
    const logInfo = getLogInfo(useOmnisharp);

    const body = `## Issue Description ##
## Steps to Reproduce ##

## Expected Behavior ##

## Actual Behavior ##

## Logs ##

${logInfo}

## Environment information ##

**VSCode version**: ${vscode.version}
**C# Extension**: ${csharpExtVersion}
**Using OmniSharp**: ${useOmnisharp}

${monoInfo}
<details><summary>Dotnet Information</summary>
${fullDotnetInfo}</details>
<details><summary>Visual Studio Code Extensions</summary>
${generateExtensionTable(extensions)}
</details>
`;

    await vscode.commands.executeCommand('workbench.action.openIssueReporter', {
        extensionId: CSharpExtensionId,
        issueBody: body,
    });
}

function sortExtensions(a: Extension<any>, b: Extension<any>): number {
    if (a.packageJSON.name.toLowerCase() < b.packageJSON.name.toLowerCase()) {
        return -1;
    }
    if (a.packageJSON.name.toLowerCase() > b.packageJSON.name.toLowerCase()) {
        return 1;
    }
    return 0;
}

function generateExtensionTable(extensions: Extension<any>[]) {
    if (extensions.length <= 0) {
        return 'none';
    }

    const tableHeader = `|Extension|Author|Version|Folder Name|\n|---|---|---|---|`;
    const table = extensions
        .map(
            (e) =>
                `|${e.packageJSON.name}|${e.packageJSON.publisher}|${e.packageJSON.version}|${basename(
                    e.extensionPath
                )}|`
        )
        .join('\n');

    const extensionTable = `
${tableHeader}\n${table};
`;

    return extensionTable;
}

async function getMonoIfPlatformValid(options: Options, monoResolver: IHostExecutableResolver): Promise<string> {
    let monoVersion = 'Unknown Mono version';
    try {
        const monoInfo = await monoResolver.getHostExecutableInfo(options);
        monoVersion = `OmniSharp using mono: ${monoInfo.version}`;
    } catch (error) {
        monoVersion = error instanceof Error ? error.message : `${error}`;
    }

    return `<details><summary>Mono Information</summary>
    ${monoVersion}</details>`;
}

function getLogInfo(useOmnisharp: boolean): string {
    if (useOmnisharp) {
        return `### OmniSharp log ###
<details>Post the output from Output-->OmniSharp log here</details>
        
### C# log ###
<details>Post the output from Output-->C# here</details>`;
    } else {
        return `<!--
If you can, it would be the most helpful to zip up and attach the entire extensions log folder.  The folder can be opened by running the \`workbench.action.openExtensionLogsFolder\` command.

Additionally, if you can reproduce the issue reliably, set the value of the \`dotnet.server.trace\` option to \`Trace\` and re-run the scenario to get more detailed logs.
-->
        
### C# log ###
<details>Post the output from Output-->C# here</details>

### C# LSP Trace Logs ###
<details>Post the output from Output-->C# LSP Trace Logs here.  Requires \`dotnet.server.trace\` to be set to \`Trace\`</details>`;
    }
}

function getInstalledExtensions(vscode: vscode) {
    const extensions = vscode.extensions.all.filter((extension) => extension.packageJSON.isBuiltin === false);

    return extensions.sort(sortExtensions);
}
