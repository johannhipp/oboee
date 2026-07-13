# Commit Message Convention

This project follows [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
The convention applies to every commit, including commits made by AI agents
and commits that only change documentation.

## Format

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Use a short, imperative description in lowercase without a trailing period.
Keep the subject line focused on one logical change. Add a body when the
context or reason for the change is not clear from the subject.

## Types

- `feat`: add user-visible functionality
- `fix`: correct a bug
- `docs`: change documentation
- `style`: make formatting-only changes
- `refactor`: change code without changing behavior
- `perf`: improve performance
- `test`: add or change tests
- `build`: change build tooling or dependencies
- `ci`: change continuous-integration configuration
- `chore`: make other maintenance changes
- `revert`: undo an earlier commit

Use a scope when it makes the affected area clearer, for example `api`,
`auth`, `ui`, or `docs`.

## Breaking changes

Append `!` after the type or scope when a commit introduces a breaking change:

```text
feat(api)!: replace the catalog response shape
```

Alternatively, describe the breaking change in a `BREAKING CHANGE:` footer.

## Examples

```text
feat(api): add catalog filtering
fix(auth): reject expired session tokens
docs: document seeded frontend mode
test(review): cover duplicate evidence submissions
```
