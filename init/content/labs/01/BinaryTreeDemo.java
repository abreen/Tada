public class BinaryTreeDemo {
    static class Node {
        int data;
        Node left;
        Node right;
    }

    static Node insert(Node node, int val) {
        if (node == null) {
            Node n = new Node();
            n.data = val;
            return n;
        }
        if (node.left == null)
            node.left = insert(node.left, val);
        else if (node.right == null)
            node.right = insert(node.right, val);
        else
            node.left = insert(node.left, val);
        return node;
    }

    public static void main(String[] args) {
        Node root = null;
        root = insert(root, 1);
        root = insert(root, 2);
        root = insert(root, 3);
        root = insert(root, 4);
        root = insert(root, 5);
        root = insert(root, 6);
        root = insert(root, 7);
    }
}
