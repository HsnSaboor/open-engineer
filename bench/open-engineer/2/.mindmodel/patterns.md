# ZenFlow OS - Design Patterns

## patterns/ComponentDefinition
- Every widget must follow a standard registration pattern:
  ```javascript
  const MyWidget = {
    id: 'my-widget',
    title: 'My Widget',
    render: () => `<div>Content</div>`,
    init: (el) => { /* logic */ }
  };
  ```

## patterns/EventBus
- Communication between widgets and the shell happens via a global `ZenBus`.
