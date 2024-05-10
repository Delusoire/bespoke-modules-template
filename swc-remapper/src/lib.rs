use std::collections::HashMap;

use serde::Deserialize;
use swc_core::ecma::ast::{Expr, Stmt};
use swc_core::ecma::visit::{noop_fold_type, Fold};
use swc_core::ecma::{ast::Program, transforms::testing::test_inline, visit::FoldWith};
use swc_core::plugin::{plugin_transform, proxies::TransformPluginProgramMetadata};

struct Transform {
    pub config: Config,
}

impl Fold for Transform {
    noop_fold_type!();

    fn fold_stmt(&mut self, stmt: Stmt) -> Stmt {
        if let Stmt::Expr(e) = &stmt {
            if let Expr::Member(m) = &*e.expr {
                m.obj
            }
        }
        stmt.fold_children_with(self)
    }
}

#[derive(Clone, Debug, Deserialize)]
pub enum ClassMapValue {
    Str(String),
    Map(HashMap<String, ClassMapValue>),
}

type ClassMap = HashMap<String, ClassMapValue>;

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub classmap: ClassMap,
}

#[plugin_transform]
pub fn process_transform(program: Program, _metadata: TransformPluginProgramMetadata) -> Program {
    let config = serde_json::from_str::<Config>(
        &_metadata
            .get_transform_plugin_config()
            .expect("failed to get plugin config for swc-remapper"),
    )
    .expect("invalid config");
    program.fold_with(&mut Transform { config })
}

test_inline!(
    Default::default(),
    |_| {
        let mut classmap: ClassMap = HashMap::new();
        classmap.insert("a".to_string(), ClassMapValue::Str("b".to_string()));
        let config = Config { classmap };
        Transform { config }
    },
    test,
    // Input codes
    r#"CLASSMAP.a;"#,
    // Output codes after transformed with plugin
    r#"b;"#
);
