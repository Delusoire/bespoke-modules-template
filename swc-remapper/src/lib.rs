use std::collections::HashMap;

use serde::Deserialize;
use swc_core::common::SyntaxContext;
use swc_core::ecma::ast::{Expr, Lit, MemberProp};
use swc_core::ecma::visit::{as_folder, noop_visit_mut_type, VisitMut};
use swc_core::ecma::{ast::Program, visit::FoldWith};
use swc_core::plugin::{plugin_transform, proxies::TransformPluginProgramMetadata};

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
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
                if i.span.ctxt != self.unresolved_ctx {
                    return None;
                }
                idents.push(i.sym.to_string());
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

impl VisitMut for Transform {
    noop_visit_mut_type!();

    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        if let Some(e) = self.apply_classmap(&Box::new(expr.clone())) {
            *expr = *e
        }
    }
}

#[plugin_transform]
pub fn process_transform(program: Program, metadata: TransformPluginProgramMetadata) -> Program {
    let config = serde_json::from_str::<Config>(
        &metadata
            .get_transform_plugin_config()
            .expect("failed to get plugin config"),
    )
    .expect("invalid config");
    let unresolved_ctx = SyntaxContext::empty().apply_mark(metadata.unresolved_mark);
    program.fold_with(&mut as_folder(Transform {
        config,
        unresolved_ctx,
    }))
}
