public class SearchTreeDemo {
    static class Node {
        String data;
        Node left;
        Node right;
        Node parent; // @trace-ignore
    }

    static Node insert(Node node, Node parent, String val) {
        if (node == null) {
            Node n = new Node();
            n.data = val;
            n.parent = parent;
            return n;
        }
        if (val.compareTo(node.data) < 0)
            node.left = insert(node.left, node, val);
        else
            node.right = insert(node.right, node, val);
        return node;
    }

    public static void main(String[] args) {
        Node root = null;
        root = insert(root, null, "fig");
        root = insert(root, null, "cherry");
        root = insert(root, null, "kiwi");
        root = insert(root, null, "apple");
        root = insert(root, null, "date");
        root = insert(root, null, "grape");
        root = insert(root, null, "mango");
    }
}
