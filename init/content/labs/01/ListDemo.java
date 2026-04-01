public class ListDemo {
    static class Node {
        String data;
        Node next;
    }

    public static void main(String[] args) {
        String[] words = {"apple", "banana", "cherry", "date", "elderberry"};

        Node head = null;
        Node tail = null;
        for (int i = 0; i < words.length; i++) {
            Node n = new Node();
            n.data = words[i];
            if (head == null) {
                head = n;
            } else {
                tail.next = n;
            }
            tail = n;
        }
    }
}
