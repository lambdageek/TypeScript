/* @internal */
namespace ts.codefix {
    const fixId = "disableJsDiagnostics";
    const errorCodes = mapDefined(Object.keys(Diagnostics) as ReadonlyArray<keyof typeof Diagnostics>, key => {
        const diag = Diagnostics[key];
        return diag.category === DiagnosticCategory.Error ? diag.code : undefined;
    });

    registerCodeFix({
        errorCodes,
        getCodeActions(context) {
            const { sourceFile, program, span, host, formatContext } = context;

            if (!isInJavaScriptFile(sourceFile) || !isCheckJsEnabledForFile(sourceFile, program.getCompilerOptions())) {
                return undefined;
            }

            const fixes: CodeFixAction[] = [
                {
                    description: getLocaleSpecificMessage(Diagnostics.Disable_checking_for_this_file),
                    changes: [createFileTextChanges(sourceFile.fileName, [
                        createTextChange(sourceFile.checkJsDirective
                            ? createTextSpanFromBounds(sourceFile.checkJsDirective.pos, sourceFile.checkJsDirective.end)
                            : createTextSpan(0, 0), `// @ts-nocheck${getNewLineOrDefaultFromHost(host, formatContext.options)}`),
                    ])],
                    // fixId unnecessary because adding `// @ts-nocheck` even once will ignore every error in the file.
                    fixId: undefined,
                }];

            if (isValidLocationToAddComment(sourceFile, span.start)) {
                fixes.unshift({
                    description: getLocaleSpecificMessage(Diagnostics.Ignore_this_error_message),
                    changes: textChanges.ChangeTracker.with(context, t => makeChange(t, sourceFile, span.start)),
                    fixId,
                });
            }

            return fixes;
        },
        fixIds: [fixId],
        getAllCodeActions: context => {
            const seenLines = createMap<true>();
            return codeFixAll(context, errorCodes, (changes, diag) => {
                if (isValidLocationToAddComment(diag.file!, diag.start!)) {
                    makeChange(changes, diag.file!, diag.start!, seenLines);
                }
            });
        },
    });

    export function isValidLocationToAddComment(sourceFile: SourceFile, position: number) {
        return !isInComment(sourceFile, position) && !isInString(sourceFile, position) && !isInTemplateString(sourceFile, position);
    }

    function makeChange(changes: textChanges.ChangeTracker, sourceFile: SourceFile, position: number, seenLines?: Map<true>) {
        const { line: lineNumber } = getLineAndCharacterOfPosition(sourceFile, position);
        // Only need to add `// @ts-ignore` for a line once.
        if (!seenLines || addToSeen(seenLines, lineNumber)) {
            changes.insertCommentBeforeLine(sourceFile, lineNumber, position, " @ts-ignore");
        }
    }
}
