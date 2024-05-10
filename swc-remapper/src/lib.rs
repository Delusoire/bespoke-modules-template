use std::collections::HashMap;

use serde::Deserialize;
use swc_core::common::{Spanned, SyntaxContext};
use swc_core::ecma::ast::{Expr, ExprStmt, Lit, MemberProp, Stmt};
use swc_core::ecma::visit::{noop_fold_type, Fold};
use swc_core::ecma::{ast::Program, visit::FoldWith};
use swc_core::plugin::{plugin_transform, proxies::TransformPluginProgramMetadata};

struct Transform {
    config: Config,
    unresolved_ctx: SyntaxContext,
}

impl Transform {
    fn apply_classmap_rtl_recur(
        &self,
        expr: &Box<Expr>,
        idents: &mut Vec<String>,
    ) -> Option<String> {
        match &**expr {
            Expr::Ident(i) => {
                if i.sym != "CLASSMAP" || i.span.ctxt != self.unresolved_ctx {
                    return None;
                }
                let fcm = idents.iter().rev().fold(
                    Some(&self.config.classmap),
                    |ocmv: Option<&ClassMap>, ident| {
                        if let Some(&ClassMap::Map(map)) = ocmv.as_ref() {
                            return map.get(ident);
                        }
                        None
                    },
                );
                if let Some(&ClassMap::Str(s)) = fcm.as_ref() {
                    return Some(s.to_string());
                }
            }
            Expr::Member(m) => {
                if let MemberProp::Ident(i) = &m.prop {
                    idents.push(i.sym.to_string());
                    return self.apply_classmap_rtl_recur(&m.obj, idents);
                }
            }
            _ => {}
        }
        None
    }
    fn apply_classmap(&self, expr: &Box<Expr>) -> Option<Box<Expr>> {
        let mut idents = Vec::new();
        self.apply_classmap_rtl_recur(expr, &mut idents)
            .map(|s| Box::new(Expr::Lit(Lit::Str(s.into()))))
    }
}

impl Fold for Transform {
    noop_fold_type!();

    fn fold_stmt(&mut self, stmt: Stmt) -> Stmt {
        if let Stmt::Expr(e) = &stmt {
            if let Some(expr) = self.apply_classmap(&e.expr) {
                return Stmt::Expr(ExprStmt {
                    span: expr.span(),
                    expr,
                });
            };
        }
        stmt.fold_children_with(self)
    }
}

#[derive(Clone, Debug, Deserialize)]
pub enum ClassMap {
    Str(String),
    Map(HashMap<String, ClassMap>),
}

impl Default for ClassMap {
    fn default() -> Self {
        ClassMap::Map(Default::default())
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub classmap: ClassMap,
}

#[plugin_transform]
pub fn process_transform(program: Program, data: TransformPluginProgramMetadata) -> Program {
    let config = serde_json::from_str::<Config>(
        &data
            .get_transform_plugin_config()
            .expect("failed to get plugin config for swc-remapper"),
    )
    .expect("invalid config");
    let unresolved_ctx = SyntaxContext::empty().apply_mark(data.unresolved_mark);
    program.fold_with(&mut Transform {
        config,
        unresolved_ctx,
    })
}

// test_inline!(
//     Default::default(),
//     |_| {
//         let mut classmap: ClassMap = HashMap::new();
//         classmap.insert("a".to_string(), ClassMapValue::Str("b".to_string()));
//         let config = Config { classmap };
//         Transform { config }
//     },
//     test,
//     // Input codes
//     r#"CLASSMAP.a;"#,
//     // Output codes after transformed with plugin
//     r#"b;"#
// );
