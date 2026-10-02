const Group = ({ title, children }) => (
  <section className="zm-group">
    {title && <h2 className="zm-group-title">{title}</h2>}
    {children}
  </section>
);

export default Group;
