/*
 * Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
 * Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
 */

package io.tiflis.code.ui.chat.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.tiflis.code.ui.theme.*

// Syntax highlighting colors (One Dark theme inspired)
private val KeywordColor = Color(0xFFC678DD)  // Purple
private val StringColor = Color(0xFF98C379)   // Green
private val CommentColor = Color(0xFF5C6370)  // Gray
private val NumberColor = Color(0xFFD19A66)   // Orange
private val FunctionColor = Color(0xFF61AFEF) // Blue
private val TypeColor = Color(0xFFE5C07B)     // Yellow
private val OperatorColor = Color(0xFF56B6C2) // Cyan

/**
 * Code block view with syntax highlighting and copy button.
 */
@Composable
fun CodeBlockView(
    code: String,
    language: String?,
    onCopy: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isDark = isSystemInDarkTheme()
    val backgroundColor = if (isDark) CodeBackgroundDark else CodeBackgroundLight
    val borderColor = if (isDark) CodeBorderDark else CodeBorderLight
    val defaultTextColor = if (isDark) Color(0xFFABB2BF) else MaterialTheme.colorScheme.onSurface

    // Apply syntax highlighting
    val highlightedCode = remember(code, language, isDark) {
        highlightCode(code, language, defaultTextColor)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
    ) {
        // Header with language and copy button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(borderColor)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = language ?: "code",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            IconButton(
                onClick = onCopy,
                modifier = Modifier.size(24.dp)
            ) {
                Icon(
                    Icons.Default.ContentCopy,
                    contentDescription = "Copy code",
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Code content with syntax highlighting
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(12.dp)
        ) {
            Text(
                text = highlightedCode,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    lineHeight = 20.sp
                )
            )
        }
    }
}

/**
 * Apply syntax highlighting to code based on language.
 */
private fun highlightCode(code: String, language: String?, defaultColor: Color): AnnotatedString {
    val lang = language?.lowercase() ?: ""

    return when (lang) {
        "kotlin", "kt" -> highlightKotlin(code, defaultColor)
        "java" -> highlightJava(code, defaultColor)
        "swift" -> highlightSwift(code, defaultColor)
        "javascript", "js", "typescript", "ts" -> highlightJavaScript(code, defaultColor)
        "python", "py" -> highlightPython(code, defaultColor)
        "rust", "rs" -> highlightRust(code, defaultColor)
        "go", "golang" -> highlightGo(code, defaultColor)
        "bash", "sh", "shell", "zsh" -> highlightBash(code, defaultColor)
        "json" -> highlightJson(code, defaultColor)
        "yaml", "yml" -> highlightYaml(code, defaultColor)
        "sql" -> highlightSql(code, defaultColor)
        else -> buildAnnotatedString {
            withStyle(SpanStyle(color = defaultColor)) {
                append(code)
            }
        }
    }
}

private fun highlightKotlin(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "fun", "val", "var", "class", "interface", "object", "data", "sealed", "enum",
        "if", "else", "when", "for", "while", "do", "return", "break", "continue",
        "import", "package", "private", "public", "protected", "internal", "open", "final",
        "override", "abstract", "companion", "suspend", "inline", "reified", "crossinline",
        "noinline", "by", "lazy", "lateinit", "const", "is", "as", "in", "out", "where",
        "try", "catch", "finally", "throw", "null", "true", "false", "this", "super"
    )
    val types = setOf(
        "String", "Int", "Long", "Float", "Double", "Boolean", "Char", "Byte", "Short",
        "Unit", "Any", "Nothing", "List", "Map", "Set", "Array", "Pair", "Triple"
    )
    return highlightGeneric(code, keywords, types, defaultColor, "//", "/*", "*/")
}

private fun highlightJava(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "public", "private", "protected", "class", "interface", "extends", "implements",
        "static", "final", "void", "new", "return", "if", "else", "for", "while", "do",
        "switch", "case", "break", "continue", "try", "catch", "finally", "throw", "throws",
        "import", "package", "abstract", "synchronized", "volatile", "transient", "native",
        "this", "super", "null", "true", "false", "instanceof"
    )
    val types = setOf(
        "String", "int", "long", "float", "double", "boolean", "char", "byte", "short",
        "Object", "Integer", "Long", "Float", "Double", "Boolean", "Character", "List", "Map", "Set"
    )
    return highlightGeneric(code, keywords, types, defaultColor, "//", "/*", "*/")
}

private fun highlightSwift(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "func", "var", "let", "class", "struct", "enum", "protocol", "extension",
        "if", "else", "switch", "case", "for", "while", "repeat", "return", "break", "continue",
        "import", "private", "public", "internal", "fileprivate", "open", "final", "override",
        "static", "mutating", "async", "await", "throws", "try", "catch", "guard", "defer",
        "self", "Self", "super", "nil", "true", "false", "is", "as", "in", "where", "some", "any"
    )
    val types = setOf(
        "String", "Int", "Double", "Float", "Bool", "Character", "Array", "Dictionary", "Set",
        "Optional", "Result", "Void", "Any", "AnyObject"
    )
    return highlightGeneric(code, keywords, types, defaultColor, "//", "/*", "*/")
}

private fun highlightJavaScript(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "function", "const", "let", "var", "class", "extends", "if", "else", "for", "while",
        "do", "switch", "case", "break", "continue", "return", "try", "catch", "finally",
        "throw", "new", "delete", "typeof", "instanceof", "import", "export", "from", "as",
        "default", "async", "await", "yield", "this", "super", "null", "undefined", "true", "false",
        "interface", "type", "enum", "implements", "private", "public", "protected", "readonly"
    )
    val types = setOf(
        "String", "Number", "Boolean", "Object", "Array", "Function", "Promise", "Map", "Set",
        "Date", "RegExp", "Error", "any", "void", "never", "unknown"
    )
    return highlightGeneric(code, keywords, types, defaultColor, "//", "/*", "*/")
}

private fun highlightPython(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "def", "class", "if", "elif", "else", "for", "while", "try", "except", "finally",
        "with", "as", "import", "from", "return", "yield", "break", "continue", "pass",
        "raise", "assert", "lambda", "and", "or", "not", "in", "is", "global", "nonlocal",
        "True", "False", "None", "self", "async", "await"
    )
    val types = setOf(
        "str", "int", "float", "bool", "list", "dict", "set", "tuple", "bytes", "type",
        "object", "Exception", "List", "Dict", "Set", "Tuple", "Optional", "Any", "Union"
    )
    return highlightGeneric(code, keywords, types, defaultColor, "#", "\"\"\"", "\"\"\"")
}

private fun highlightRust(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "fn", "let", "mut", "const", "static", "struct", "enum", "impl", "trait", "type",
        "if", "else", "match", "for", "while", "loop", "return", "break", "continue",
        "use", "mod", "pub", "crate", "self", "super", "async", "await", "move", "ref",
        "where", "unsafe", "extern", "dyn", "true", "false", "Some", "None", "Ok", "Err"
    )
    val types = setOf(
        "i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64", "u128", "usize",
        "f32", "f64", "bool", "char", "str", "String", "Vec", "Box", "Rc", "Arc", "Option", "Result"
    )
    return highlightGeneric(code, keywords, types, defaultColor, "//", "/*", "*/")
}

private fun highlightGo(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "func", "var", "const", "type", "struct", "interface", "map", "chan",
        "if", "else", "switch", "case", "for", "range", "return", "break", "continue",
        "package", "import", "go", "defer", "select", "default", "fallthrough", "goto",
        "true", "false", "nil", "iota"
    )
    val types = setOf(
        "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64",
        "float32", "float64", "complex64", "complex128", "bool", "byte", "rune", "string", "error"
    )
    return highlightGeneric(code, keywords, types, defaultColor, "//", "/*", "*/")
}

private fun highlightBash(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac",
        "function", "return", "exit", "break", "continue", "in", "select", "until",
        "export", "local", "readonly", "declare", "typeset", "unset", "shift",
        "echo", "printf", "read", "source", "eval", "exec", "true", "false"
    )
    return highlightGeneric(code, keywords, emptySet(), defaultColor, "#", null, null)
}

private fun highlightJson(code: String, defaultColor: Color): AnnotatedString {
    return buildAnnotatedString {
        var i = 0
        while (i < code.length) {
            when {
                code[i] == '"' -> {
                    val end = findStringEnd(code, i)
                    val str = code.substring(i, end + 1)
                    // Check if this is a key (followed by :)
                    val isKey = code.substring(end + 1).trimStart().startsWith(":")
                    withStyle(SpanStyle(color = if (isKey) FunctionColor else StringColor)) {
                        append(str)
                    }
                    i = end + 1
                }
                code[i].isDigit() || (code[i] == '-' && i + 1 < code.length && code[i + 1].isDigit()) -> {
                    val start = i
                    while (i < code.length && (code[i].isDigit() || code[i] == '.' || code[i] == '-' || code[i] == 'e' || code[i] == 'E' || code[i] == '+')) i++
                    withStyle(SpanStyle(color = NumberColor)) {
                        append(code.substring(start, i))
                    }
                }
                code.substring(i).startsWith("true") || code.substring(i).startsWith("false") || code.substring(i).startsWith("null") -> {
                    val word = when {
                        code.substring(i).startsWith("true") -> "true"
                        code.substring(i).startsWith("false") -> "false"
                        else -> "null"
                    }
                    withStyle(SpanStyle(color = KeywordColor)) {
                        append(word)
                    }
                    i += word.length
                }
                else -> {
                    withStyle(SpanStyle(color = defaultColor)) {
                        append(code[i])
                    }
                    i++
                }
            }
        }
    }
}

private fun highlightYaml(code: String, defaultColor: Color): AnnotatedString {
    return buildAnnotatedString {
        code.lines().forEach { line ->
            when {
                line.trimStart().startsWith("#") -> {
                    withStyle(SpanStyle(color = CommentColor)) {
                        append(line)
                    }
                }
                line.contains(":") -> {
                    val colonIndex = line.indexOf(":")
                    withStyle(SpanStyle(color = FunctionColor)) {
                        append(line.substring(0, colonIndex + 1))
                    }
                    withStyle(SpanStyle(color = StringColor)) {
                        append(line.substring(colonIndex + 1))
                    }
                }
                else -> {
                    withStyle(SpanStyle(color = defaultColor)) {
                        append(line)
                    }
                }
            }
            append("\n")
        }
    }
}

private fun highlightSql(code: String, defaultColor: Color): AnnotatedString {
    val keywords = setOf(
        "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "LIKE", "BETWEEN",
        "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE",
        "ALTER", "DROP", "INDEX", "VIEW", "JOIN", "INNER", "LEFT", "RIGHT", "OUTER",
        "ON", "AS", "ORDER", "BY", "ASC", "DESC", "GROUP", "HAVING", "LIMIT", "OFFSET",
        "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "UNION", "ALL", "NULL", "IS"
    ).map { it.lowercase() }.toSet()
    val types = setOf(
        "INT", "INTEGER", "VARCHAR", "TEXT", "BOOLEAN", "DATE", "TIMESTAMP", "FLOAT", "DOUBLE",
        "DECIMAL", "CHAR", "BLOB", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "AUTO_INCREMENT"
    ).map { it.lowercase() }.toSet()
    return highlightGeneric(code, keywords, types, defaultColor, "--", "/*", "*/", caseInsensitive = true)
}

private fun highlightGeneric(
    code: String,
    keywords: Set<String>,
    types: Set<String>,
    defaultColor: Color,
    lineComment: String,
    blockCommentStart: String?,
    blockCommentEnd: String?,
    caseInsensitive: Boolean = false
): AnnotatedString {
    return buildAnnotatedString {
        var i = 0
        while (i < code.length) {
            when {
                // Block comment
                blockCommentStart != null && code.substring(i).startsWith(blockCommentStart) -> {
                    val end = code.indexOf(blockCommentEnd ?: "", i + blockCommentStart.length)
                    val commentEnd = if (end >= 0) end + (blockCommentEnd?.length ?: 0) else code.length
                    withStyle(SpanStyle(color = CommentColor)) {
                        append(code.substring(i, commentEnd))
                    }
                    i = commentEnd
                }
                // Line comment
                code.substring(i).startsWith(lineComment) -> {
                    val end = code.indexOf('\n', i)
                    val commentEnd = if (end >= 0) end else code.length
                    withStyle(SpanStyle(color = CommentColor)) {
                        append(code.substring(i, commentEnd))
                    }
                    i = commentEnd
                }
                // String (double quotes)
                code[i] == '"' -> {
                    val end = findStringEnd(code, i)
                    withStyle(SpanStyle(color = StringColor)) {
                        append(code.substring(i, end + 1))
                    }
                    i = end + 1
                }
                // String (single quotes)
                code[i] == '\'' -> {
                    val end = findCharEnd(code, i)
                    withStyle(SpanStyle(color = StringColor)) {
                        append(code.substring(i, end + 1))
                    }
                    i = end + 1
                }
                // Number
                code[i].isDigit() -> {
                    val start = i
                    while (i < code.length && (code[i].isDigit() || code[i] == '.' || code[i] == 'x' || code[i] == 'X' ||
                                code[i] in 'a'..'f' || code[i] in 'A'..'F' || code[i] == '_' || code[i] == 'L' || code[i] == 'f')) i++
                    withStyle(SpanStyle(color = NumberColor)) {
                        append(code.substring(start, i))
                    }
                }
                // Identifier or keyword
                code[i].isLetter() || code[i] == '_' -> {
                    val start = i
                    while (i < code.length && (code[i].isLetterOrDigit() || code[i] == '_')) i++
                    val word = code.substring(start, i)
                    val wordLower = if (caseInsensitive) word.lowercase() else word

                    val color = when {
                        (if (caseInsensitive) keywords else keywords).contains(wordLower) -> KeywordColor
                        (if (caseInsensitive) types else types).contains(wordLower) -> TypeColor
                        else -> defaultColor
                    }
                    withStyle(SpanStyle(color = color, fontWeight = if (color == KeywordColor) FontWeight.Bold else FontWeight.Normal)) {
                        append(word)
                    }
                }
                // Operators
                code[i] in "+-*/%=<>!&|^~" -> {
                    withStyle(SpanStyle(color = OperatorColor)) {
                        append(code[i])
                    }
                    i++
                }
                else -> {
                    withStyle(SpanStyle(color = defaultColor)) {
                        append(code[i])
                    }
                    i++
                }
            }
        }
    }
}

private fun findStringEnd(code: String, start: Int): Int {
    var i = start + 1
    while (i < code.length) {
        if (code[i] == '\\' && i + 1 < code.length) {
            i += 2
        } else if (code[i] == '"') {
            return i
        } else {
            i++
        }
    }
    return code.length - 1
}

private fun findCharEnd(code: String, start: Int): Int {
    var i = start + 1
    while (i < code.length) {
        if (code[i] == '\\' && i + 1 < code.length) {
            i += 2
        } else if (code[i] == '\'') {
            return i
        } else {
            i++
        }
    }
    return code.length - 1
}
