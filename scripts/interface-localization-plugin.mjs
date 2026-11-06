/**
 * Compile-time extraction for the legacy VI/EN UI. Only presentation text is
 * transformed: JSX text/accessible attributes, language text pairs and explicit
 * presentation metadata. IDs, payload values, customer data and CSS stay intact.
 */
const textAttributes = new Set(["title", "placeholder", "alt", "aria-label"]);
const textProperties = new Set(["title", "description", "message", "label"]);
const localeCodes = new Set(["vi-VN", "en-US", "en-GB"]);

function human(value) {
  return /\p{L}/u.test(value)
    && !/^(?:https?:|\/|#[\da-f]+$)/iu.test(value)
    && !/^(?:vi|en|ltr|rtl|text|email|password|button|submit|reset)$/u.test(value)
    && !/^(?:[A-Z0-9_]+|[a-z]+(?:-[a-z\d]+)+)$/u.test(value)
    && !/(?:^|\s)(?:bg-|text-|border-|hover:|focus:|rounded-|flex\b|grid\b|px-|py-|w-|h-)/u.test(value);
}

function jsxWhitespace(value) {
  const lines = value.split(/\r\n|\n|\r/u);
  let last = 0;
  lines.forEach((line, index) => { if (/[^ \t]/u.test(line)) last = index; });
  return lines.map((line, index) => {
    let clean = line.replace(/\t/gu, " ");
    if (index !== 0) clean = clean.replace(/^ +/u, "");
    if (index !== lines.length - 1) clean = clean.replace(/ +$/u, "");
    return clean ? clean + (index === last ? "" : " ") : "";
  }).join("");
}

export default function interfaceLocalizationPlugin({ types: t }) {
  function language(path) {
    return path.scope.hasBinding("language") ? t.identifier("language") : null;
  }
  function register(state, source, vi) {
    state.opts.collect?.({ source: source.trim(), ...(vi ? { vi: vi.trim() } : {}) });
  }
  function requestImport(state, kind) {
    if (!state.interfaceImports.has(kind)) {
      state.interfaceImports.set(kind, state.program.scope.generateUidIdentifier(kind));
    }
    return t.cloneNode(state.interfaceImports.get(kind));
  }
  function callText(path, state, source, lang = language(path)) {
    register(state, source);
    return t.callExpression(requestImport(state, "interfaceText"), [
      t.stringLiteral(source), ...(lang ? [lang] : []),
    ]);
  }
  function textElement(state, source, values) {
    register(state, source);
    const name = requestImport(state, "InterfaceText").name;
    return t.jsxElement(
      t.jsxOpeningElement(t.jsxIdentifier(name), [
        // Babel escapes newly generated Unicode strings. JSX attribute quotes
        // treat those escapes literally; an expression preserves the actual key.
        t.jsxAttribute(t.jsxIdentifier("source"), t.jsxExpressionContainer(t.stringLiteral(source))),
        ...(values ? [t.jsxAttribute(t.jsxIdentifier("values"), t.jsxExpressionContainer(values))] : []),
      ], true),
      null, [], true,
    );
  }
  function template(node) {
    if (t.isStringLiteral(node)) return { source: node.value, values: [] };
    if (t.isTemplateLiteral(node)) {
      let source = node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
      node.expressions.forEach((_, index) => {
        source += `{{${index}}}` + (node.quasis[index + 1].value.cooked ?? node.quasis[index + 1].value.raw);
      });
      return { source, values: node.expressions };
    }
    return null;
  }
  function isVietnameseTest(node) {
    if (t.isIdentifier(node) && /^(?:vi|isVi|isVietnamese)$/u.test(node.name)) return true;
    return t.isBinaryExpression(node)
      && ["===", "=="].includes(node.operator)
      && t.isStringLiteral(node.right, { value: "vi" });
  }
  function isEnglishTest(node) {
    return t.isBinaryExpression(node) && ["===", "=="].includes(node.operator)
      && t.isStringLiteral(node.right, { value: "en" });
  }
  function displayFunction(path) {
    return path.findParent((candidate) => {
      if (!candidate.isFunction()) return false;
      const name = candidate.node.id?.name ?? candidate.parentPath?.node.id?.name ?? "";
      return /(?:label|title|message|copy|reason|error|hint|text)$/iu.test(name);
    });
  }
  // Intl options are protocol enums, not presentation text, even inside a
  // helper named dateLabel/amountLabel. Leave the locale argument eligible for
  // the existing selected-language rewrite, but never translate its options.
  function technicalFormatOption(path) {
    let branch = path;
    for (let parent = path.parentPath; parent; branch = parent, parent = parent.parentPath) {
      if (!parent.isCallExpression() && !parent.isNewExpression()) continue;
      const callee = parent.node.callee;
      if (!t.isMemberExpression(callee)) continue;
      const method = t.isIdentifier(callee.property) ? callee.property.name
        : t.isStringLiteral(callee.property) ? callee.property.value : "";
      const formatter = t.isIdentifier(callee.object, { name: "Intl" })
        || ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"].includes(method);
      if (formatter && parent.node.arguments.indexOf(branch.node) > 0) return true;
    }
    return false;
  }
  function localizeLeaves(path, state, node, lang = language(path)) {
    if (t.isConditionalExpression(node)) {
      node.consequent = localizeLeaves(path, state, node.consequent, lang);
      node.alternate = localizeLeaves(path, state, node.alternate, lang);
      return node;
    }
    if (t.isLogicalExpression(node)) {
      node.right = localizeLeaves(path, state, node.right, lang);
      return node;
    }
    const candidate = template(node);
    if (!candidate || !human(candidate.source)) return node;
    register(state, candidate.source);
    return t.callExpression(requestImport(state, "interfaceText"), [
      t.stringLiteral(candidate.source), lang ?? t.identifier("undefined"),
      t.objectExpression(candidate.values.map((value, index) => t.objectProperty(t.stringLiteral(String(index)), value))),
    ]);
  }
  return {
    name: "telecamp-interface-localization",
    visitor: {
      Program: {
        enter(path, state) {
          state.program = path;
          state.interfaceImports = new Map();
          state.skipInterfaceLocalization = /\/(?:locales|interface-runtime|interface-catalogs|feedback-i18n|LanguageSelector|InterfaceText)\.[cm]?[jt]sx?$/u.test(state.filename ?? "")
            || /\.test\.[jt]sx?$/u.test(state.filename ?? "");
          if (!state.skipInterfaceLocalization) {
            const objectValue = (node) => t.isTSAsExpression(node) ? objectValue(node.expression) : node;
            const fields = (node) => new Map(t.isObjectExpression(node) ? node.properties
              .filter((property) => t.isObjectProperty(property) && !property.computed)
              .map((property) => [t.isIdentifier(property.key) ? property.key.name : property.key.value, property.value]) : []);
            const collectPair = (english, vietnamese) => {
              const en = template(english), vi = template(vietnamese);
              const alignedVietnamese = (englishTemplate, vietnameseTemplate) => {
                if (!vietnameseTemplate) return undefined;
                const positions = vietnameseTemplate.values.map((value) =>
                  englishTemplate.values.findIndex((candidate) => t.isNodesEquivalent(candidate, value)));
                if (positions.some((index) => index < 0)) return undefined;
                return vietnameseTemplate.source.replace(/\{\{(\d+)\}\}/gu, (_, index) => `{{${positions[Number(index)]}}}`);
              };
              if (en && human(en.source)) register(state, en.source, alignedVietnamese(en, vi));
              else {
                const enFields = fields(objectValue(english)), viFields = fields(objectValue(vietnamese));
                for (const [key, value] of enFields) collectPair(value, viFields.get(key));
                if (t.isArrowFunctionExpression(english)) {
                  const collectReturnedCopy = (node, viNode) => {
                    if (t.isConditionalExpression(node)) {
                      const paired = t.isConditionalExpression(viNode)
                        && t.isNodesEquivalent(node.test, viNode.test);
                      collectReturnedCopy(node.consequent, paired ? viNode.consequent : undefined);
                      collectReturnedCopy(node.alternate, paired ? viNode.alternate : undefined);
                      return;
                    }
                    const body = template(node), viBody = template(viNode);
                    if (body && human(body.source)) register(state, body.source, alignedVietnamese(body, viBody));
                  };
                  collectReturnedCopy(english.body, t.isArrowFunctionExpression(vietnamese) ? vietnamese.body : undefined);
                }
              }
            };
            path.traverse({
              VariableDeclarator(variable) {
                const properties = fields(objectValue(variable.node.init));
                if (properties.has("en") && properties.has("vi")) collectPair(properties.get("en"), properties.get("vi"));
              },
              ArrayExpression(array) {
                const values = array.node.elements;
                const vi = values.at(-2), en = values.at(-1);
                if (t.isStringLiteral(vi) && t.isStringLiteral(en)
                  && /[À-ÖØ-öø-ž\u1ea0-\u1ef9]/u.test(vi.value)
                  && human(en.value)) register(state, en.value, vi.value);
              },
            });
          }
        },
        exit(path, state) {
          if (!state.interfaceImports.size) return;
          const runtime = [], components = [];
          for (const [name, id] of state.interfaceImports) {
            (["interfaceText", "interfaceCopy", "interfacePair"].includes(name) ? runtime : components).push(t.importSpecifier(id, t.identifier(name)));
          }
          if (runtime.length) path.unshiftContainer("body", t.importDeclaration(runtime, t.stringLiteral("@/lib/interface-runtime")));
          if (components.length) path.unshiftContainer("body", t.importDeclaration(components, t.stringLiteral("@/components/InterfaceText")));
        },
      },
      ConditionalExpression: {
        enter(path, state) {
          if (state.skipInterfaceLocalization || technicalFormatOption(path)) return;
          const node = path.node, lang = language(path);
          if (isEnglishTest(node.test)) {
            node.test = t.binaryExpression("===", node.test.left, t.stringLiteral("vi"));
            [node.consequent, node.alternate] = [node.alternate, node.consequent];
          } else if (lang && t.isLogicalExpression(node.test, { operator: "&&" }) && isEnglishTest(node.test.left)) {
            node.test.left = t.binaryExpression("!==", node.test.left.left, t.stringLiteral("vi"));
          }
        },
        exit(path, state) {
          if (state.skipInterfaceLocalization || technicalFormatOption(path) || !isVietnameseTest(path.node.test)) return;
          const en = template(path.node.alternate), vi = template(path.node.consequent);
          if (!en || !vi) return;
          const lang = language(path);
          if (localeCodes.has(en.source) && localeCodes.has(vi.source)) {
            if (lang) path.replaceWith(lang);
            return;
          }
          if (!human(en.source) && !human(vi.source)) return;
          if (en.values.length !== vi.values.length
            || en.values.some((value, index) => !t.isNodesEquivalent(value, vi.values[index]))) {
            state.opts.unresolved?.({ file: state.filename, line: path.node.loc?.start.line, source: en.source, reason: "different-template-values" });
            return;
          }
          register(state, en.source, vi.source);
          path.replaceWith(t.callExpression(requestImport(state, "interfaceText"), [
            t.stringLiteral(en.source), lang ?? t.identifier("undefined"),
            t.objectExpression(en.values.map((value, index) => t.objectProperty(t.stringLiteral(String(index)), value))),
          ]));
          path.skip();
        },
      },
      JSXText(path, state) {
        if (state.skipInterfaceLocalization) return;
        const source = jsxWhitespace(path.node.value);
        if (!human(source.trim())) return;
        const lang = language(path);
        path.replaceWith(lang
          ? t.jsxExpressionContainer(callText(path, state, source, lang))
          : textElement(state, source));
        path.skip();
      },
      JSXExpressionContainer: {
        exit(path, state) {
          if (state.skipInterfaceLocalization || t.isJSXAttribute(path.parent)) return;
          if (t.isConditionalExpression(path.node.expression) || t.isLogicalExpression(path.node.expression)) {
            path.node.expression = localizeLeaves(path, state, path.node.expression);
            return;
          }
          const candidate = template(path.node.expression);
          if (!candidate || !human(candidate.source)) return;
          const lang = language(path);
          register(state, candidate.source);
          const values = t.objectExpression(candidate.values.map((value, index) => t.objectProperty(t.stringLiteral(String(index)), value)));
          path.replaceWith(lang
            ? t.jsxExpressionContainer(t.callExpression(requestImport(state, "interfaceText"), [t.stringLiteral(candidate.source), lang, values]))
            : textElement(state, candidate.source, values));
          path.skip();
        },
      },
      JSXElement: {
        exit(path, state) {
          if (state.skipInterfaceLocalization) return;
          const attributes = path.get("openingElement.attributes");
          const relevant = attributes.filter((attr) =>
            t.isJSXAttribute(attr.node)
            && t.isJSXIdentifier(attr.node.name)
            && textAttributes.has(attr.node.name.name)
            && t.isStringLiteral(attr.node.value)
            && human(attr.node.value.value));
          if (!relevant.length) return;
          const lang = language(path);
          for (const attr of relevant) {
            register(state, attr.node.value.value);
            if (lang) attr.node.value = t.jsxExpressionContainer(callText(path, state, attr.node.value.value, lang));
          }
          if (!lang) {
            const name = requestImport(state, "InterfaceAttributes").name;
            path.replaceWith(t.jsxElement(
              t.jsxOpeningElement(t.jsxIdentifier(name), [], false),
              t.jsxClosingElement(t.jsxIdentifier(name)), [path.node], false,
            ));
          }
          path.skip();
        },
      },
      ObjectProperty(path, state) {
        if (state.skipInterfaceLocalization || technicalFormatOption(path) || path.node.computed) return;
        const key = t.isIdentifier(path.node.key) ? path.node.key.name
          : t.isStringLiteral(path.node.key) ? path.node.key.value : "";
        const display = displayFunction(path);
        if ((!textProperties.has(key) && !display) || !t.isStringLiteral(path.node.value) || !human(path.node.value.value)) return;
        const lang = language(path);
        if (lang || display) path.node.value = callText(path, state, path.node.value.value, lang);
        // Module-level bilingual metadata is translated by interfaceCopy at
        // selection time, not mutated eagerly while the module is loading.
      },
      ReturnStatement(path, state) {
        if (state.skipInterfaceLocalization || !path.node.argument || !displayFunction(path)) return;
        path.node.argument = localizeLeaves(path, state, path.node.argument);
      },
      JSXOpeningElement(path, state) {
        if (state.skipInterfaceLocalization || !t.isJSXIdentifier(path.node.name)
          || !["input", "textarea"].includes(path.node.name.name)
          || path.node.attributes.some((attribute) => t.isJSXAttribute(attribute) && attribute.name.name === "dir")) return;
        const type = path.node.attributes.find((attribute) => t.isJSXAttribute(attribute) && attribute.name.name === "type");
        const technical = t.isStringLiteral(type?.value) && ["email", "password", "tel", "url", "number", "date", "time", "datetime-local", "range", "checkbox", "radio", "file"].includes(type.value.value);
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier("dir"), t.stringLiteral(technical ? "ltr" : "auto")));
      },
      CallExpression(path, state) {
        if (state.skipInterfaceLocalization || !t.isIdentifier(path.node.callee)) return;
        const name = path.node.callee.name;
        if (["t", "ti", "interfaceText"].includes(name) && t.isStringLiteral(path.node.arguments[0])) {
          register(state, path.node.arguments[0].value);
        }
        if (name === "localizedErrorMessage" && t.isStringLiteral(path.node.arguments[2])) {
          const source = path.node.arguments[2].value;
          register(state, source);
          path.node.arguments[2] = t.callExpression(requestImport(state, "interfaceText"), [
            t.stringLiteral(source), path.node.arguments[1],
          ]);
          path.skip();
        }
      },
      "MemberExpression|OptionalMemberExpression": {
        exit(path, state) {
          if (state.skipInterfaceLocalization || technicalFormatOption(path) || !path.node.computed) return;
          const property = path.node.property;
          if (!t.isConditionalExpression(property) || !isVietnameseTest(property.test)) return;
          const pair = t.isNumericLiteral(property.consequent, { value: 0 })
            && t.isNumericLiteral(property.alternate, { value: 1 });
          if (!pair && (!t.isStringLiteral(property.consequent, { value: "vi" })
            || !t.isStringLiteral(property.alternate, { value: "en" }))) return;
          const lang = language(path);
          if (!pair && !lang) return;
          path.replaceWith(t.callExpression(requestImport(state, pair ? "interfacePair" : "interfaceCopy"), [
            path.node.object, ...(lang ? [lang] : []),
          ]));
          path.skip();
        },
      },
    },
  };
}
